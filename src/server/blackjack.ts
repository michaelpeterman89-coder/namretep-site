import "server-only";
import {
  actionChanges,
  applyAction,
  automaticAction,
  betChanges,
  BETTING_SECONDS,
  IllegalActionError,
  judgeDecision,
  legalActions,
  nextDeadline,
  payoutChanges,
  publicView,
  roundStats,
  seatsToDeal,
  startRound,
  type ActionType,
  type BlackjackAction,
  type BlackjackRound,
  type ChipChange,
  type PublicRound,
} from "@/lib/games/blackjack";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  friendlyDbError,
  GameError,
  getPlayerChips,
  getSeats,
  getTable,
  touchTable,
  type GameTable,
  type SeatInfo,
} from "./tables";

// Blackjack rounds at a table: betting, dealing, player actions, and
// timeouts. The engine decides what's legal; this file checks who's asking
// and saves each change together with its chips, stats, and decisions.

export { GameError } from "./tables";

/** The round as one player may see it, plus what they can do right now. */
export type RoundForPlayer = {
  roundId: string;
  version: number;
  view: PublicRound;
  /** This player's seat within the round, or -1 if they weren't dealt in. */
  seat: number;
  actions: ActionType[];
  /** When the current decision times out (ISO), or null for no timer. */
  deadline: string | null;
  /** How the player's last action compared with basic strategy (null if there was no real choice). */
  feedback?: { onBook: boolean; bookAction: ActionType; situation: string } | null;
};

type StoredRound = { id: string; version: number; round: BlackjackRound; deadline: Date | null };

/** The table's most recent round, active or finished, including its secret state. */
async function getLatestRound(tableId: string): Promise<StoredRound | null> {
  const { data, error } = await createAdminClient()
    .from("blackjack_rounds")
    .select("id, version, deadline_at, blackjack_round_secrets(state)")
    .eq("table_id", tableId)
    .order("round_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw friendlyDbError(error);
  if (!data) return null;
  const secrets = data.blackjack_round_secrets as unknown as { state: BlackjackRound } | null;
  if (!secrets) throw new Error(`Round ${data.id} is missing its state`);
  return {
    id: data.id,
    version: data.version,
    round: secrets.state,
    deadline: data.deadline_at ? new Date(data.deadline_at) : null,
  };
}

function forPlayer(table: GameTable, stored: StoredRound, playerId: string): RoundForPlayer {
  const seat = stored.round.seats.findIndex((s) => s.playerId === playerId);
  return {
    roundId: stored.id,
    version: stored.version,
    view: publicView(stored.round),
    seat,
    actions: seat >= 0 ? legalActions(table.rules, stored.round, seat) : [],
    deadline: stored.deadline?.toISOString() ?? null,
  };
}

const seatedSet = (seats: SeatInfo[]) => new Set(seats.map((s) => s.playerId));

/** Generated types mark every SQL argument as required, but these ones accept null. */
const orNull = (value: string | null | undefined) => (value ?? null) as string;

// ---------- Everything a viewer needs ----------

export type TableView = {
  table: Omit<GameTable, "bettingDeadline" | "inviteCode"> & {
    bettingDeadline: string | null;
    /** Only shown to the owner and players at the table. */
    inviteCode: string | null;
  };
  seats: SeatInfo[];
  round: RoundForPlayer | null;
  me: { playerId: string; seatNumber: number | null; chips: number; isOwner: boolean };
  /** Server clock, so the browser can correct its countdowns. */
  serverNow: string;
};

export async function getTableView(table: GameTable, playerId: string): Promise<TableView> {
  const [seats, latest, chips] = await Promise.all([
    getSeats(table.id),
    getLatestRound(table.id),
    getPlayerChips(playerId),
  ]);
  const mySeat = seats.find((s) => s.playerId === playerId);
  const insider = table.ownerId === playerId || Boolean(mySeat);
  return {
    table: {
      ...table,
      inviteCode: insider ? table.inviteCode : null,
      bettingDeadline: table.bettingDeadline?.toISOString() ?? null,
    },
    seats,
    round: latest ? forPlayer(table, latest, playerId) : null,
    me: { playerId, seatNumber: mySeat?.seatNumber ?? null, chips, isOwner: table.ownerId === playerId },
    serverNow: new Date().toISOString(),
  };
}

export async function isRoundInProgress(tableId: string): Promise<boolean> {
  const latest = await getLatestRound(tableId);
  return Boolean(latest && latest.round.phase !== "settled");
}

// ---------- Betting and dealing ----------

/** Puts down (or changes) the player's bet for the next deal, then deals if everyone's in. */
export async function placeBet(table: GameTable, playerId: string, bet: number) {
  if (table.status !== "open") throw new GameError("This table is closed.");
  if (!Number.isInteger(bet) || bet < table.minBet || bet > table.maxBet) {
    throw new GameError(
      `Bet must be between ${table.minBet.toLocaleString("en-US")} and ${table.maxBet.toLocaleString("en-US")}.`,
    );
  }
  if (await isRoundInProgress(table.id)) throw new GameError("Wait for the current hand to finish.");
  if ((await getPlayerChips(playerId)) < bet) throw new GameError("You don't have enough chips for that bet.");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("table_seats")
    // Betting brings a player back from sitting out. Their missed-turn count
    // only resets when they actually make a move.
    .update({ pending_bet: bet, bet_placed_at: new Date().toISOString(), status: "active" })
    .eq("table_id", table.id)
    .eq("player_id", playerId)
    .select("seat_number");
  if (error) throw friendlyDbError(error);
  if (!data || data.length === 0) throw new GameError("Take a seat before betting.");

  // With others at the table, the first bet starts the betting clock.
  const seats = await getSeats(table.id);
  if (seats.filter((s) => s.status === "active").length > 1 && !table.bettingDeadline) {
    await admin
      .from("game_tables")
      .update({ betting_deadline_at: new Date(Date.now() + BETTING_SECONDS * 1000).toISOString() })
      .eq("id", table.id)
      .is("betting_deadline_at", null);
  }
  await touchTable(table.id);
  await dealIfReady(table.id);
}

/** Deals the next round if betting is done. Safe to call any time, from anyone. */
async function dealIfReady(tableId: string) {
  const table = await getTable(tableId);
  if (!table || table.status !== "open") return;
  const latest = await getLatestRound(table.id);
  if (latest && latest.round.phase !== "settled") return;

  const seats = await getSeats(table.id);
  const toDeal = seatsToDeal(seats, table.bettingDeadline, new Date());
  if (!toDeal) return;

  // Anyone who can no longer cover their bet is skipped (their bet is cleared).
  const chips = await Promise.all(toDeal.map((s) => getPlayerChips(s.playerId)));
  const dealt = toDeal.filter((s, i) => chips[i] >= (s.pendingBet ?? 0));
  if (dealt.length === 0) {
    await createAdminClient()
      .from("table_seats")
      .update({ pending_bet: null, bet_placed_at: null })
      .eq("table_id", table.id);
    return;
  }

  const round = startRound(
    table.rules,
    latest?.round.shoe ?? null,
    dealt.map((s) => ({ playerId: s.playerId, bet: s.pendingBet! })),
  );
  const chipChanges: ChipChange[] = [...betChanges(round), ...payoutChanges(round)];
  const deadline = nextDeadline(table.rules, round, seatedSet(seats), new Date());

  const { error } = await createAdminClient().rpc("bj_deal", {
    p_table_id: table.id,
    p_phase: round.phase,
    p_public: publicView(round),
    p_secret: round,
    p_chips: chipChanges,
    p_stats: roundStats(table.rules, round),
    p_players: toDeal.map((s) => s.playerId),
    p_deadline: orNull(deadline?.toISOString()),
  });
  // 23505: someone else's request dealt this round a moment earlier. Fine.
  if (error) {
    if (error.code === "23505") return;
    throw friendlyDbError(error);
  }

  // Players who didn't bet sit out, so later rounds don't wait for them.
  // Betting again brings them back.
  const skipped = seats.filter((s) => s.status === "active" && !toDeal.some((d) => d.playerId === s.playerId));
  if (skipped.length > 0) {
    await createAdminClient()
      .from("table_seats")
      .update({ status: "sitting_out" })
      .eq("table_id", table.id)
      .in("player_id", skipped.map((s) => s.playerId));
  }
}

// ---------- Actions ----------

type Commit = {
  stored: StoredRound;
  next: BlackjackRound;
  action: BlackjackAction;
  actor: string | null;
  timedOut: string[];
  decision: ReturnType<typeof judgeDecision>;
  seats: SeatInfo[];
};

async function commit(table: GameTable, c: Commit): Promise<number> {
  const deadline = nextDeadline(table.rules, c.next, seatedSet(c.seats), new Date());
  const { data, error } = await createAdminClient().rpc("bj_act", {
    p_round_id: c.stored.id,
    p_version: c.stored.version,
    p_phase: c.next.phase,
    p_public: publicView(c.next),
    p_secret: c.next,
    p_chips: [...actionChanges(c.stored.round, c.action), ...payoutChanges(c.next)],
    p_decisions: c.decision ? [c.decision] : [],
    p_stats: roundStats(table.rules, c.next),
    p_deadline: orNull(deadline?.toISOString()),
    p_actor: orNull(c.actor),
    p_timed_out: c.timedOut,
  });
  if (error) throw error;
  return data;
}

/**
 * Applies one player action. `version` is the round version the player was
 * looking at. On your turn it must match exactly, so a double-click can't act
 * twice. Insurance decisions happen at the same time for everyone, so those
 * retry against the latest round instead (the engine still refuses repeats).
 */
export async function takeAction(
  table: GameTable,
  playerId: string,
  roundId: string,
  version: number,
  type: ActionType,
  hintsEnabled = false,
): Promise<RoundForPlayer> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const [stored, seats] = await Promise.all([getLatestRound(table.id), getSeats(table.id)]);
    if (!stored || stored.id !== roundId) throw new GameError("That hand is over. Refreshing…");
    if (!seats.some((s) => s.playerId === playerId)) throw new GameError("You're not sitting at this table.");
    if (stored.round.phase !== "early" && stored.version !== version) {
      throw new GameError("That hand already moved on. Refreshing…");
    }

    const seat = stored.round.seats.findIndex((s) => s.playerId === playerId);
    if (seat < 0) throw new GameError("You're not playing this hand.");

    const action = { type, seat };
    let next: BlackjackRound;
    try {
      next = applyAction(table.rules, stored.round, action);
    } catch (e) {
      if (e instanceof IllegalActionError) throw new GameError("That move isn't allowed right now.");
      throw e;
    }
    const decision = judgeDecision(table.rules, stored.round, action, hintsEnabled);

    try {
      const newVersion = await commit(table, { stored, next, action, actor: playerId, timedOut: [], decision, seats });
      const result = await getLatestRound(table.id);
      return {
        ...forPlayer(table, result ?? { ...stored, version: newVersion, round: next }, playerId),
        feedback: decision
          ? { onBook: decision.on_book, bookAction: decision.book_action as ActionType, situation: decision.situation }
          : null,
      };
    } catch (e) {
      const err = e as { code?: string; message: string };
      // Someone else's insurance decision landed first: try again on the new round.
      if (err.message?.includes("STALE_ROUND") && stored.round.phase === "early") continue;
      throw friendlyDbError(err);
    }
  }
  throw new GameError("The table is busy. Please try again.");
}

/**
 * Moves the table along when time is up: finishes moves for players who ran
 * out of time or left, and deals once betting closes. Anyone watching may
 * call this; it only acts when a deadline has really passed.
 */
export async function runTimeouts(table: GameTable) {
  for (let step = 0; step < 30; step++) {
    const [stored, seats] = await Promise.all([getLatestRound(table.id), getSeats(table.id)]);
    if (!stored || stored.round.phase === "settled") {
      await dealIfReady(table.id);
      return;
    }

    const expired = stored.deadline !== null && new Date() >= stored.deadline;
    const action = automaticAction(table.rules, stored.round, seatedSet(seats), expired);
    if (!action) return;

    const player = stored.round.seats[action.seat].playerId;
    const next = applyAction(table.rules, stored.round, action);
    try {
      await commit(table, {
        stored,
        next,
        action,
        actor: null,
        // Only players still at the table pick up a missed turn.
        timedOut: seats.some((s) => s.playerId === player) ? [player] : [],
        decision: null,
        seats,
      });
    } catch (e) {
      const err = e as { message: string };
      if (!err.message?.includes("STALE_ROUND")) throw friendlyDbError(err);
      // Someone else moved first; look again.
    }
  }
}
