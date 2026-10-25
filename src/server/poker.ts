import "server-only";
import {
  actionOptions,
  applyAction,
  BOT_NAMES,
  botDecision,
  engineConfig,
  HAND_PAUSE_MS,
  IllegalPokerAction,
  nextButtonIndex,
  parsePokerRules,
  pokerDeadline,
  pokerHandStats,
  pokerSummary,
  publicHand,
  startHand,
  type ActionOptions,
  type PokerActionType,
  type PokerHand,
  type PublicHand,
} from "@/lib/games/poker";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  friendlyDbError,
  GameError,
  getPlayerChips,
  getPokerTable,
  getSeats,
  isBotId,
  touchTable,
  type PokerTable,
  type SeatInfo,
} from "./tables";

// Poker hands at a table: buying in, dealing, actions, bots, and timeouts.
// The engine decides what's legal; this file checks who's asking and saves
// each change through the poker_* database functions.

/** Everything the server keeps about a hand (secret: includes the deck and all cards). */
type StoredState = {
  hand: PokerHand;
  /** Table seat number of each player in the hand, in the same order as hand.seats. */
  seatNumbers: number[];
  /** Stacks when the hand started, for working out each player's result. */
  startStacks: number[];
};

type StoredHand = {
  id: string;
  version: number;
  deadline: Date | null;
  completedAt: Date | null;
  state: StoredState;
};

/** What everyone at the table may see (no deck, no unshown cards). */
function publicState(state: StoredState) {
  return { hand: publicHand(state.hand, null), seatNumbers: state.seatNumbers };
}

async function getLatestHand(tableId: string): Promise<StoredHand | null> {
  const { data, error } = await createAdminClient()
    .from("poker_hands")
    .select("id, version, deadline_at, completed_at, poker_hand_secrets(state)")
    .eq("table_id", tableId)
    .order("hand_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw friendlyDbError(error);
  if (!data) return null;
  const secret = data.poker_hand_secrets as unknown as { state: StoredState } | null;
  if (!secret) throw new Error(`Hand ${data.id} is missing its state`);
  return {
    id: data.id,
    version: data.version,
    deadline: data.deadline_at ? new Date(data.deadline_at) : null,
    completedAt: data.completed_at ? new Date(data.completed_at) : null,
    state: secret.state,
  };
}

const presentPlayers = (seats: SeatInfo[]) => new Set(seats.filter((s) => !s.leaving).map((s) => s.playerId));
/** Generated types mark every SQL argument as required, but these accept null. */
const orNull = (value: string | null | undefined) => (value ?? null) as string;

// ---------- Creating tables ----------

export type NewPokerTableInput = {
  name: string;
  visibility: "public" | "private";
  seats: number;
  rules: unknown;
};

export async function createPokerTable(ownerId: string, input: NewPokerTableInput): Promise<string> {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 40) throw new GameError("Table name must be 1–40 characters.");
  if (input.visibility !== "public" && input.visibility !== "private") throw new GameError("Choose public or private.");
  if (!Number.isInteger(input.seats) || input.seats < 2 || input.seats > 9) throw new GameError("Seats must be 2–9.");
  const parsed = parsePokerRules(input.rules, input.seats);
  if (!parsed.ok) throw new GameError(parsed.error);

  const { data, error } = await createAdminClient()
    .from("game_tables")
    .insert({
      game: "holdem",
      name,
      owner_id: ownerId,
      visibility: input.visibility,
      invite_code: input.visibility === "private" ? newInviteCode() : null,
      seats: input.seats,
      min_bet: parsed.rules.bigBlind,
      max_bet: parsed.rules.maxBuyIn,
      rules: parsed.rules,
    })
    .select("id")
    .single();
  if (error || !data) throw friendlyDbError(error ?? { message: "No table returned" });
  return data.id;
}

const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(8));
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join("");
}

// ---------- Bots ----------

/**
 * Keeps the table's bot seats in line with its settings while at least one
 * person is sitting, and clears them when nobody is (so empty tables can
 * close). Bots take the highest free seats.
 */
async function syncBots(table: PokerTable) {
  const admin = createAdminClient();
  const seats = await getSeats(table.id);
  const people = seats.filter((s) => !s.isBot);
  const bots = seats.filter((s) => s.isBot);
  const latest = await getLatestHand(table.id);
  const handRunning = latest !== null && latest.state.hand.phase !== "complete";

  if (people.length === 0) {
    if (bots.length > 0 && !handRunning) await admin.from("table_seats").delete().eq("table_id", table.id).not("bot_name", "is", null);
    return;
  }
  const wanted = Math.min(table.rules.bots, table.seats - people.length);
  if (bots.length >= wanted) return;

  const taken = new Set(seats.map((s) => s.seatNumber));
  const usedNames = new Set(bots.map((b) => b.username));
  const freeSeats = Array.from({ length: table.seats }, (_, i) => table.seats - 1 - i).filter((n) => !taken.has(n));
  const names = BOT_NAMES.filter((n) => !usedNames.has(n));
  const rows = freeSeats.slice(0, wanted - bots.length).map((seat_number, i) => ({
    table_id: table.id,
    seat_number,
    bot_name: names[i],
    stack: table.rules.maxBuyIn,
  }));
  if (rows.length > 0) {
    const { error } = await admin.from("table_seats").insert(rows);
    // 23505: a player took one of those seats at the same moment; try again next time.
    if (error && error.code !== "23505") throw friendlyDbError(error);
  }
}

// ---------- Sitting down and leaving ----------

export async function buyIn(table: PokerTable, playerId: string, seatNumber: number, amount: number) {
  if (table.status !== "open") throw new GameError("This table is closed.");
  if (!Number.isInteger(seatNumber) || seatNumber < 0 || seatNumber >= table.seats) throw new GameError("No such seat.");
  const { minBuyIn, maxBuyIn } = table.rules;
  if (!Number.isInteger(amount) || amount < minBuyIn || amount > maxBuyIn) {
    throw new GameError(`Buy in for ${minBuyIn.toLocaleString("en-US")}–${maxBuyIn.toLocaleString("en-US")} chips.`);
  }
  if ((await getPlayerChips(playerId)) < amount) throw new GameError("You don't have enough chips for that buy-in.");

  const { error } = await createAdminClient().rpc("poker_buy_in", {
    p_table_id: table.id,
    p_seat_number: seatNumber,
    p_player_id: playerId,
    p_amount: amount,
  });
  if (error) throw friendlyDbError(error, "That seat was just taken, or you're already sitting here.");
  await syncBots(table);
  await startHandIfReady(table.id);
}

/** True while a hand is being played at the table. */
export async function isHandInProgress(tableId: string): Promise<boolean> {
  return (await getLatestHand(tableId))?.state.hand.phase === "betting";
}

/**
 * Leaves the table. Between hands you're cashed out now; mid-hand you're
 * folded when it's your turn and cashed out when the hand ends.
 */
export async function leaveTable(table: PokerTable, playerId: string) {
  const latest = await getLatestHand(table.id);
  const inHand =
    latest?.state.hand.phase === "betting" &&
    latest.state.hand.seats.some((s) => s.playerId === playerId && !s.folded);
  const admin = createAdminClient();
  if (inHand) {
    await admin.from("table_seats").update({ leaving: true }).eq("table_id", table.id).eq("player_id", playerId);
    await touchTable(table.id);
    await runPokerTimeouts(table); // folds them now if it's their turn
    return;
  }
  const { error } = await admin.rpc("poker_cash_out", { p_table_id: table.id, p_player_id: playerId });
  if (error) throw friendlyDbError(error);
  await syncBots(table);
}

/** After a hand: cash out anyone leaving or out of chips, and keep bots topped up. */
async function afterHand(table: PokerTable) {
  const admin = createAdminClient();
  for (const seat of await getSeats(table.id)) {
    if (seat.isBot) {
      if ((seat.stack ?? 0) < table.rules.bigBlind * 10) {
        await admin.from("table_seats").update({ stack: table.rules.maxBuyIn }).eq("table_id", table.id).eq("seat_number", seat.seatNumber);
      }
      continue;
    }
    if (seat.leaving || seat.stack === 0) {
      const { error } = await admin.rpc("poker_cash_out", { p_table_id: table.id, p_player_id: seat.playerId });
      if (error) throw friendlyDbError(error);
    }
  }
  await syncBots(table);
}

// ---------- Dealing ----------

/** Deals the next hand if there are enough players and the last hand's pause is over. */
export async function startHandIfReady(tableId: string) {
  const table = await getPokerTable(tableId);
  if (!table || table.status !== "open") return;
  const latest = await getLatestHand(table.id);
  if (latest && latest.state.hand.phase !== "complete") return;
  if (latest?.completedAt && Date.now() < latest.completedAt.getTime() + HAND_PAUSE_MS) return;

  const seats = await getSeats(table.id);
  const playing = seats
    .filter((s) => s.status === "active" && !s.leaving && (s.stack ?? 0) > 0)
    .sort((a, b) => a.seatNumber - b.seatNumber);
  if (playing.length < 2 || !playing.some((s) => !s.isBot)) return;

  const seatNumbers = playing.map((s) => s.seatNumber);
  const previousButton = latest ? latest.state.seatNumbers[latest.state.hand.button] : null;
  const hand = startHand(
    engineConfig(table.rules),
    playing.map((s) => ({ playerId: s.playerId, stack: s.stack! })),
    nextButtonIndex(seatNumbers, previousButton),
  );
  const state: StoredState = { hand, seatNumbers, startStacks: playing.map((s) => s.stack!) };
  const deadline = pokerDeadline(hand, presentPlayers(seats), new Date());

  const { data, error } = await createAdminClient()
    .rpc("poker_start_hand", {
      p_table_id: table.id,
      p_phase: "betting",
      p_public: publicState(state),
      p_secret: state,
      p_deadline: orNull(deadline?.toISOString()),
    })
    .single<{ hand_id: string; hand_number: number }>();
  if (error) {
    if (error.code === "23505") return; // someone else dealt it a moment earlier
    throw friendlyDbError(error);
  }
  // Rare: everyone was all-in from the blinds, so the hand is already over.
  if (hand.phase === "complete") {
    await commit(table, { id: data!.hand_id, version: 1, deadline: null, completedAt: null, state }, hand, null, []);
  }
}

// ---------- Actions ----------

async function commit(table: PokerTable, stored: StoredHand, next: PokerHand, actor: string | null, timedOut: string[]) {
  const seats = await getSeats(table.id);
  const state: StoredState = { ...stored.state, hand: next };
  const complete = next.phase === "complete";
  const deadline = pokerDeadline(next, presentPlayers(seats), new Date());
  const { error } = await createAdminClient().rpc("poker_apply", {
    p_hand_id: stored.id,
    p_version: stored.version,
    p_phase: next.phase,
    p_public: publicState(state),
    p_secret: state,
    p_deadline: orNull(deadline?.toISOString()),
    p_stacks: complete ? state.seatNumbers.map((seat_number, i) => ({ seat_number, stack: next.seats[i].stack })) : [],
    p_stats: complete ? pokerHandStats(next, state.startStacks, pokerSummary(table.rules)) : [],
    p_actor: orNull(actor && !isBotId(actor) ? actor : null),
    p_timed_out: timedOut.filter((id) => !isBotId(id)),
  });
  if (error) throw error;
  if (complete) await afterHand(table);
}

/**
 * A player's move. `version` is the hand version they were looking at, so a
 * double-click can't act twice. For "raise", `amount` is the total to raise to.
 */
export async function takePokerAction(
  table: PokerTable,
  playerId: string,
  handId: string,
  version: number,
  type: PokerActionType,
  amount?: number,
) {
  const stored = await getLatestHand(table.id);
  if (!stored || stored.id !== handId) throw new GameError("That hand is over. Refreshing…");
  if (stored.version !== version) throw new GameError("That hand already moved on. Refreshing…");
  const seat = stored.state.hand.seats.findIndex((s) => s.playerId === playerId);
  if (seat < 0) throw new GameError("You're not in this hand.");

  let next: PokerHand;
  try {
    next = applyAction(stored.state.hand, { type, seat, amount });
  } catch (e) {
    if (e instanceof IllegalPokerAction) throw new GameError(e.message);
    throw e;
  }
  try {
    await commit(table, stored, next, playerId, []);
  } catch (e) {
    throw e instanceof GameError ? e : friendlyDbError(e as { message: string });
  }
}

/**
 * Moves the table along: bots act once they've "thought", people who ran out
 * of time or left are checked or folded, and the next hand is dealt after the
 * pause. Anyone watching may call this; it only acts when a deadline passed.
 */
export async function runPokerTimeouts(table: PokerTable) {
  for (let step = 0; step < 40; step++) {
    const stored = await getLatestHand(table.id);
    if (!stored || stored.state.hand.phase === "complete") {
      await startHandIfReady(table.id);
      return;
    }
    const hand = stored.state.hand;
    const seat = hand.toAct!;
    const actor = hand.seats[seat].playerId;
    const seats = await getSeats(table.id);
    const present = presentPlayers(seats);
    const expired = stored.deadline !== null && Date.now() >= stored.deadline.getTime();

    let next: PokerHand;
    let timedOut: string[] = [];
    if (isBotId(actor)) {
      if (!expired) return;
      next = applyAction(hand, botDecision(publicHand(hand, actor), seat));
    } else {
      const gone = !present.has(actor);
      if (!gone && !expired) return;
      const options = actionOptions(hand, seat)!;
      next = applyAction(hand, { type: options.check ? "check" : "fold", seat });
      if (!gone) timedOut = [actor];
    }
    try {
      await commit(table, stored, next, null, timedOut);
    } catch (e) {
      const err = e as { message: string };
      if (!err.message?.includes("STALE_HAND")) throw friendlyDbError(err);
    }
  }
}

// ---------- What a viewer sees ----------

export type PokerSeatView = SeatInfo & {
  /** Chips in front of the seat right now (live during a hand). */
  liveStack: number | null;
};

export type PokerView = {
  table: Omit<PokerTable, "bettingDeadline" | "inviteCode"> & { inviteCode: string | null };
  seats: PokerSeatView[];
  hand: {
    id: string;
    version: number;
    view: PublicHand;
    seatNumbers: number[];
    /** This viewer's index in the hand, or -1. */
    mySeat: number;
    options: ActionOptions | null;
    deadline: string | null;
    completedAt: string | null;
  } | null;
  /** When the next hand may be dealt (after the results pause). */
  nextHandAt: string | null;
  me: { playerId: string; seatNumber: number | null; chips: number; isOwner: boolean };
  serverNow: string;
};

export async function getPokerView(table: PokerTable, playerId: string): Promise<PokerView> {
  const [seats, latest, chips] = await Promise.all([getSeats(table.id), getLatestHand(table.id), getPlayerChips(playerId)]);
  const mine = seats.find((s) => s.playerId === playerId);
  const insider = table.ownerId === playerId || Boolean(mine);
  const live = latest && latest.state.hand.phase !== "complete" ? latest.state : null;
  const mySeat = latest ? latest.state.hand.seats.findIndex((s) => s.playerId === playerId) : -1;

  const { bettingDeadline, inviteCode, ...rest } = table;
  void bettingDeadline;
  return {
    table: { ...rest, inviteCode: insider ? inviteCode : null },
    seats: seats.map((s) => {
      const index = live ? live.seatNumbers.indexOf(s.seatNumber) : -1;
      return { ...s, liveStack: index >= 0 ? live!.hand.seats[index].stack : s.stack };
    }),
    hand: latest
      ? {
          id: latest.id,
          version: latest.version,
          view: publicHand(latest.state.hand, playerId),
          seatNumbers: latest.state.seatNumbers,
          mySeat,
          options: mySeat >= 0 ? actionOptions(latest.state.hand, mySeat) : null,
          deadline: latest.deadline?.toISOString() ?? null,
          completedAt: latest.completedAt?.toISOString() ?? null,
        }
      : null,
    nextHandAt: latest?.completedAt ? new Date(latest.completedAt.getTime() + HAND_PAUSE_MS).toISOString() : null,
    me: { playerId, seatNumber: mine?.seatNumber ?? null, chips, isOwner: table.ownerId === playerId },
    serverNow: new Date().toISOString(),
  };
}
