"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { formatChips } from "@/lib/chips";
import { handValue, isTwoCard21, type Card } from "@/lib/games/blackjack/cards";
import type { ActionType, PlayerHand, Seat } from "@/lib/games/blackjack/engine";
import { houseEdge, rulesSummary } from "@/lib/games/blackjack/rules";
import { actionLabel } from "@/lib/games/blackjack/strategy";
import { createClient } from "@/lib/supabase/client";
import { useStoredToggle } from "@/lib/use-stored-toggle";
import type { TableView } from "@/server/blackjack";
import type { SeatInfo } from "@/server/tables";
import {
  betAction,
  closeTableAction,
  playAction,
  sitAction,
  standAction,
  type TableResult,
} from "../actions";
import { computePlan, DealContext, dealerSlot, DealtCard, EMPTY_PLAN, playerSlot, prefersReducedMotion, Shoe, type DealPlan } from "./dealing";

const ACTION_LABELS: Record<ActionType, string> = {
  hit: "Hit",
  stand: "Stand",
  double: "Double",
  split: "Split",
  surrender: "Surrender",
  insurance: "Insurance",
  decline: "No thanks",
};

const ACTION_STYLES: Partial<Record<ActionType, string>> = {
  hit: "bg-neon-cyan text-ink",
  stand: "bg-neon-magenta text-ink",
  double: "bg-neon-gold text-ink",
  split: "bg-neon-gold text-ink",
};

const OUTCOME_LABELS: Record<NonNullable<PlayerHand["outcome"]>, { text: string; style: string }> = {
  blackjack: { text: "Blackjack!", style: "bg-neon-gold text-ink" },
  win: { text: "Win", style: "bg-neon-cyan text-ink" },
  push: { text: "Push", style: "bg-space-700 text-starlight" },
  lose: { text: "Lose", style: "bg-ink text-starlight/70" },
  bust: { text: "Bust", style: "bg-ink text-neon-magenta" },
  surrender: { text: "Surrendered", style: "bg-ink text-starlight/70" },
};

function totalLabel(cards: Card[], fromSplit = false): string {
  if (cards.length === 0) return "";
  if (!fromSplit && isTwoCard21(cards)) return "Blackjack";
  const { total, soft } = handValue(cards);
  if (total > 21) return `${total} · Bust`;
  return soft && total < 21 ? `Soft ${total}` : String(total);
}

function seatNet(seat: Seat): number {
  const wagered = seat.hands.reduce((sum, h) => sum + h.bet, 0) + seat.insurance;
  const returned = seat.hands.reduce((sum, h) => sum + (h.returned ?? 0), 0) + (seat.insuranceReturned ?? 0);
  return returned - wagered;
}

/** Seconds left on a deadline, using the server's clock. */
function secondsLeft(deadline: string | null | undefined, serverNow: number): number | null {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - serverNow) / 1000));
}

type Synced = {
  view: TableView;
  /** Server clock minus browser clock, for countdowns. */
  offset: number;
  /** Cards to animate for the latest update. */
  plan: DealPlan;
  /** Totals, results, and buttons wait until this time, so cards land first. */
  busyUntil: number;
};

/** GET refreshes the table; POST also finishes moves whose time ran out. */
async function loadTable(tableId: string, method: "GET" | "POST"): Promise<TableView | null> {
  try {
    const response = await fetch(`/api/tables/${tableId}`, { method, cache: "no-store" });
    if (!response.ok) return null;
    return ((await response.json()) as TableResult).view;
  } catch {
    return null; // offline for a moment; the next update will catch up
  }
}

export function BlackjackTable({ initialView }: { initialView: TableView }) {
  const router = useRouter();
  const tableId = initialView.table.id;
  const [{ view, offset, plan, busyUntil }, setSynced] = useState<Synced>(() => ({
    view: initialView,
    offset: new Date(initialView.serverNow).getTime() - Date.now(),
    plan: EMPTY_PLAN,
    busyUntil: 0,
  }));
  const shoeRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [bet, setBet] = useState(() => Math.min(Math.max(initialView.table.minBet, 10), initialView.table.maxBet));
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [hints, setHints] = useStoredToggle("namretep:hints", false);

  const latestAt = useRef(initialView.serverNow);
  const chips = useRef(initialView.me.chips);

  /** Takes a fresh view from the server, ignoring any that arrive out of order. */
  const accept = useCallback(
    (next: TableView | null) => {
      if (!next || next.serverNow < latestAt.current) return;
      latestAt.current = next.serverNow;
      const receivedAt = Date.now();
      const reduced = prefersReducedMotion();
      setSynced((prev) => {
        const nextPlan = computePlan(prev.view.round, next.round, reduced);
        return {
          view: next,
          offset: new Date(next.serverNow).getTime() - receivedAt,
          plan: nextPlan,
          // An update with nothing to animate leaves any running deal alone.
          busyUntil: nextPlan.durationMs > 0 ? receivedAt + nextPlan.durationMs : prev.busyUntil,
        };
      });
      if (next.me.chips !== chips.current) {
        chips.current = next.me.chips;
        router.refresh(); // update the chip count in the header
      }
    },
    [router],
  );

  // ---------- Live updates ----------

  const fetching = useRef(false);
  const fetchAgain = useRef(false);
  const refetch = useCallback(async () => {
    if (fetching.current) {
      fetchAgain.current = true;
      return;
    }
    fetching.current = true;
    try {
      do {
        fetchAgain.current = false;
        accept(await loadTable(tableId, "GET"));
      } while (fetchAgain.current);
    } finally {
      fetching.current = false;
    }
  }, [tableId, accept]);

  useEffect(() => {
    // Every change at the table touches its game_tables row; refetch on each.
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Realtime only sends rows this player may see, so it must know who
      // they are before subscribing; otherwise it connects as logged out.
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase
        .channel(`table-${tableId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "game_tables", filter: `id=eq.${tableId}` },
          () => void refetch(),
        )
        .subscribe();
    })();

    // A slow backup in case the live connection drops.
    const backup = setInterval(() => {
      if (document.visibilityState === "visible") void refetch();
    }, 10_000);
    return () => {
      cancelled = true;
      clearInterval(backup);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [tableId, refetch]);

  // ---------- Clocks and timeouts ----------

  const round = view.round;
  const roundActive = Boolean(round && round.view.phase !== "settled");
  const deadline = roundActive ? round?.deadline : view.table.bettingDeadline;
  const left = secondsLeft(deadline, now + offset);

  // While cards are being dealt, results stay hidden.
  const busy = now < busyUntil;

  // Tick while there's a countdown, or until the current deal has finished.
  useEffect(() => {
    if (!deadline && Date.now() >= busyUntil) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (!deadline && t >= busyUntil) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [deadline, busyUntil]);

  // When a countdown hits zero, ask the server to move things along. It
  // checks the deadline itself, so it's fine if several viewers ask at once.
  const lastTick = useRef<{ deadline: string; at: number } | null>(null);
  useEffect(() => {
    if (!deadline || left === null || left > 0) return;
    const last = lastTick.current;
    if (last && last.deadline === deadline && Date.now() - last.at < 2000) return;
    lastTick.current = { deadline, at: Date.now() };
    const delay = Math.random() * 500;
    const timer = setTimeout(async () => accept(await loadTable(tableId, "POST")), delay);
    return () => clearTimeout(timer);
  }, [deadline, left, tableId, accept]);

  // ---------- Player actions ----------

  function apply(request: Promise<TableResult>) {
    startTransition(async () => {
      const result = await request;
      accept(result.view);
      setError(result.ok ? null : (result.error ?? "Something went wrong."));
      const feedback = result.feedback;
      setHint(
        hints && feedback && !feedback.onBook
          ? `Book play: ${actionLabel(feedback.bookAction)} (${feedback.situation})`
          : null,
      );
    });
  }

  const { table, seats, me } = view;
  const { rules } = table;
  const mySeat = seats.find((s) => s.playerId === me.playerId) ?? null;
  const othersActive = seats.filter((s) => s.playerId !== me.playerId && s.status === "active").length;

  function placeBet() {
    if (pending) return;
    if (bet < table.minBet || bet > table.maxBet) {
      setError(`Bet must be between ${formatChips(table.minBet)} and ${formatChips(table.maxBet)}.`);
      return;
    }
    if (bet > me.chips) {
      setError("You don't have enough chips for that bet.");
      return;
    }
    apply(betAction(tableId, bet));
  }

  function closeTable() {
    startTransition(async () => {
      const result = await closeTableAction(tableId);
      if (result.ok) {
        router.push("/lobby");
        return;
      }
      accept(result.view);
      setError(result.error ?? "Something went wrong.");
    });
  }

  function act(type: ActionType) {
    if (!round || pending) return;
    apply(playAction(tableId, round.roundId, round.version, type, hints));
  }

  async function copyInvite() {
    if (!table.inviteCode) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/blackjack/invite/${table.inviteCode}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy. Share the invite code instead.");
    }
  }

  // ---------- Who's who in the round ----------

  const roundSeatFor = (playerId: string) => round?.view.seats.find((s) => s.playerId === playerId) ?? null;
  const roundSeatIndex = (playerId: string) => round?.view.seats.findIndex((s) => s.playerId === playerId) ?? -1;
  const nameOf = (playerId: string) =>
    playerId === me.playerId ? "you" : (seats.find((s) => s.playerId === playerId)?.username ?? "a player who left");

  const waitingOn: string[] = [];
  if (round && roundActive) {
    if (round.view.phase === "early") {
      round.view.seats.forEach((s) => !s.earlyDecided && waitingOn.push(s.playerId));
    } else if (round.view.turn) {
      waitingOn.push(round.view.seats[round.view.turn.seat].playerId);
    }
  }
  const myMove = Boolean(round && round.actions.length > 0);
  const myRoundSeat = round && round.seat >= 0 ? round.view.seats[round.seat] : null;
  const playerHasBlackjack = myRoundSeat ? isTwoCard21(myRoundSeat.hands[0].cards) && !myRoundSeat.hands[0].fromSplit : false;

  function actionCost(type: ActionType): number {
    if (!myRoundSeat || !round) return 0;
    if (type === "insurance") return Math.floor(myRoundSeat.baseBet / 2);
    if ((type === "double" || type === "split") && round.view.turn) return myRoundSeat.hands[round.view.turn.hand].bet;
    return 0;
  }

  let status: string | null = null;
  if (round?.view.phase === "early") {
    status = round.view.dealer[0][0] === "A" ? "Dealer shows an ace." : "Dealer will check for blackjack.";
  } else if (round?.view.phase === "playing" && round.view.peeked) {
    status = "Dealer checked: no blackjack.";
  } else if (round?.view.phase === "settled" && round.view.dealerBlackjack) {
    status = "Dealer has blackjack.";
  }

  const chipSteps = [1, 5, 25, 100, 500, 1000].filter((c) => c <= table.maxBet);
  const small = table.seats > 2;

  if (table.status === "closed") {
    return (
      <div className="pixel-panel mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <h1 className="font-display text-base text-starlight">{table.name}</h1>
        <p className="text-starlight/70">This table was closed by its host.</p>
        <button type="button" onClick={() => router.push("/lobby")} className="pixel-btn bg-neon-cyan text-ink">
          Go to the lobby
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Table info */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-base text-starlight sm:text-lg">{table.name}</h1>
          <p className="text-sm text-starlight/70">
            <span className="font-display text-[0.6rem] text-neon-cyan">{rulesSummary(rules)}</span>
            {" · "}House edge ≈ {houseEdge(rules).toFixed(2)}% · Bets {formatChips(table.minBet)}–
            {formatChips(table.maxBet)}
          </p>
        </div>
        <p className="flex items-baseline gap-2">
          <span className="text-sm text-starlight/70">Balance</span>
          <span className="font-display text-base text-neon-gold">{formatChips(me.chips)}</span>
        </p>
      </div>

      {/* Felt */}
      <DealContext value={{ shoeRef, plan }}>
      <section
        aria-label="Blackjack table"
        className="pixel-panel relative flex min-h-[24rem] flex-col items-center justify-between gap-6 overflow-hidden px-3 py-6 sm:px-6"
        style={{ background: "radial-gradient(ellipse at 50% 0%, #2a1a6e, var(--color-space-900) 70%)" }}
      >
        <Shoe cardsLeft={round ? round.view.cardsLeftInShoe : null} />
        <div className="flex flex-col items-center gap-2">
          <span className="font-display text-[0.6rem] text-starlight/60">Dealer</span>
          <div className="card-fan flex min-h-20 sm:min-h-28">
            {round &&
              Array.from({ length: round.view.dealer.length + round.view.dealerHidden }, (_, i) => (
                <DealtCard key={`${round.roundId}-${i}`} slot={dealerSlot(i)} card={round.view.dealer[i] ?? null} />
              ))}
          </div>
          {round && (
            <span className="min-h-4 font-display text-xs text-starlight">
              {busy
                ? " "
                : round.view.dealerHidden > 0
                  ? `Showing ${totalLabel(round.view.dealer)}`
                  : totalLabel(round.view.dealer)}
            </span>
          )}
        </div>

        <p className="text-center font-display text-[0.55rem] leading-relaxed text-neon-gold/70 sm:text-[0.65rem]">
          Blackjack pays {rules.blackjackPayout.replace(":", " to ")} · Dealer {rules.dealerHitsSoft17 ? "hits" : "stands"} on
          soft 17
          {rules.insurance && " · Insurance pays 2 to 1"}
        </p>

        <div className="flex w-full flex-wrap items-start justify-center gap-3 sm:gap-4">
          {Array.from({ length: table.seats }, (_, seatNumber) => {
            const occupant = seats.find((s) => s.seatNumber === seatNumber) ?? null;
            return (
              <SeatSpot
                key={seatNumber}
                seatNumber={seatNumber}
                occupant={occupant}
                isMe={occupant?.playerId === me.playerId}
                roundSeat={occupant ? roundSeatFor(occupant.playerId) : null}
                activeHand={
                  occupant && round?.view.phase === "playing" && round.view.turn?.seat === roundSeatIndex(occupant.playerId)
                    ? round.view.turn.hand
                    : null
                }
                waiting={Boolean(occupant && waitingOn.includes(occupant.playerId))}
                secondsLeft={roundActive ? left : null}
                canSit={!mySeat && !pending}
                onSit={() => apply(sitAction(tableId, seatNumber))}
                small={small}
                revealed={!busy}
                roundKey={round?.roundId ?? ""}
              />
            );
          })}
        </div>
      </section>
      </DealContext>

      {/* Messages */}
      <div aria-live="polite" className="flex min-h-6 flex-col items-center gap-1 text-center">
        {round?.view.reshuffled && roundActive && <p className="text-sm text-neon-cyan">The shoe was shuffled.</p>}
        {status && !busy && <p className="text-sm text-starlight/80">{status}</p>}
        {myRoundSeat && myRoundSeat.insurance > 0 && (
          <p className="text-sm text-starlight/80">
            Insurance: {formatChips(myRoundSeat.insurance)}
            {round?.view.phase === "settled" &&
              !busy &&
              ((myRoundSeat.insuranceReturned ?? 0) > 0 ? " — paid!" : " — lost")}
          </p>
        )}
        {round?.view.phase === "settled" && myRoundSeat && !busy && <ResultLine net={seatNet(myRoundSeat)} />}
        {hint && !busy && (
          <p className="rounded border-2 border-neon-gold bg-neon-gold/10 px-3 py-1.5 text-sm text-starlight">{hint}</p>
        )}
        {error && (
          <p role="alert" className="text-sm text-neon-magenta">
            {error}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="pixel-panel flex flex-col items-center gap-4 p-4 sm:p-5">
        {!mySeat ? (
          <p className="text-center text-starlight/80">
            You&apos;re watching.{" "}
            {seats.length < table.seats ? "Pick an empty seat to join the game." : "Every seat is taken."}
          </p>
        ) : roundActive ? (
          myMove ? (
            <>
              {left !== null && (
                <p className={`font-display text-xs ${left <= 5 ? "text-neon-magenta" : "text-neon-cyan"}`}>
                  Your move · {left}s
                </p>
              )}
              <div className="flex flex-wrap justify-center gap-3">
                {round!.actions.map((type) => {
                  const cost = actionCost(type);
                  const label = type === "insurance" && playerHasBlackjack ? "Even money" : ACTION_LABELS[type];
                  return (
                    <button
                      key={type}
                      type="button"
                      disabled={pending || busy || cost > me.chips}
                      onClick={() => act(type)}
                      className={`pixel-btn disabled:opacity-50 ${ACTION_STYLES[type] ?? "bg-space-800 text-starlight"}`}
                    >
                      {label}
                      {cost > 0 && <span className="ml-2 opacity-70">({formatChips(cost)})</span>}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="text-center text-starlight/80">
              {myRoundSeat ? "" : "You're sitting this hand out. "}
              {waitingOn.length > 0 && <>Waiting for {waitingOn.map(nameOf).join(", ")}</>}
              {left !== null && waitingOn.length > 0 && ` · ${left}s`}
            </p>
          )
        ) : (
          <>
            {mySeat.pendingBet !== null && (
              <p className="text-center text-starlight/80">
                Your bet: <span className="font-display text-xs text-neon-gold">{formatChips(mySeat.pendingBet)}</span>
                {othersActive > 0 && " · Waiting for other players to bet"}
                {left !== null && ` · Dealing in ${left}s`}
              </p>
            )}
            {mySeat.status === "sitting_out" && mySeat.pendingBet === null && (
              <p className="text-center text-sm text-starlight/70">You&apos;re sitting out. Place a bet to rejoin.</p>
            )}
            {mySeat.pendingBet === null && left !== null && (
              <p className="text-center text-sm text-neon-cyan">Next hand deals in {left}s. Place your bet!</p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {chipSteps.map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setBet((b) => Math.min(b + step, table.maxBet))}
                  className="chip-token hover:brightness-110"
                  aria-label={`Add ${step} to bet`}
                >
                  +{formatChips(step)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setBet(table.minBet)}
                className="px-2 text-sm text-starlight/70 underline underline-offset-4 hover:text-starlight"
              >
                Reset
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <label className="flex items-center gap-2">
                <span className="font-display text-[0.65rem] text-neon-cyan">Bet</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={table.minBet}
                  max={table.maxBet}
                  value={bet}
                  onChange={(e) => setBet(Math.floor(Number(e.target.value) || 0))}
                  className="pixel-input w-32"
                />
              </label>
              <button
                type="button"
                onClick={placeBet}
                disabled={pending}
                className="pixel-btn bg-neon-magenta text-ink disabled:opacity-60"
              >
                {pending ? "…" : othersActive === 0 ? "Deal" : mySeat.pendingBet !== null ? "Change bet" : "Place bet"}
              </button>
            </div>
          </>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-sm text-starlight/80">
          <input
            type="checkbox"
            checked={hints}
            onChange={(e) => setHints(e.target.checked)}
            className="size-4 accent-neon-gold"
          />
          Show a hint after a mistake
        </label>
        {hints && (
          <p className="-mt-2 text-center text-xs text-starlight/60">
            Decisions made with hints on don&apos;t count toward your On Book %.
          </p>
        )}
      </div>

      {/* Table management */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        {table.inviteCode && (
          <span className="flex flex-wrap items-center gap-2 text-starlight/80">
            Invite code <span className="font-display text-xs text-neon-gold">{table.inviteCode}</span>
            <button
              type="button"
              onClick={copyInvite}
              className="rounded-md border-2 border-space-700 px-2.5 py-1 hover:border-neon-gold"
            >
              {copied ? "Link copied!" : "Copy invite link"}
            </button>
          </span>
        )}
        {mySeat && (
          <button
            type="button"
            disabled={pending}
            onClick={() => apply(standAction(tableId))}
            className="rounded-md border-2 border-space-700 px-2.5 py-1 hover:border-neon-magenta"
          >
            Leave seat
          </button>
        )}
        {me.isOwner && !roundActive && (
          <ConfirmButton label="Close table" confirmLabel="Yes, close it" onConfirm={closeTable} />
        )}
      </div>
    </div>
  );
}

function SeatSpot({
  seatNumber,
  occupant,
  isMe,
  roundSeat,
  activeHand,
  waiting,
  secondsLeft,
  canSit,
  onSit,
  small,
  revealed,
  roundKey,
}: {
  seatNumber: number;
  occupant: SeatInfo | null;
  isMe: boolean;
  roundSeat: Seat | null;
  activeHand: number | null;
  waiting: boolean;
  secondsLeft: number | null;
  canSit: boolean;
  onSit: () => void;
  small: boolean;
  /** False while cards are still being dealt: totals and results wait. */
  revealed: boolean;
  /** Changes every round, so each new hand's cards are new elements that fly in. */
  roundKey: string;
}) {
  if (!occupant) {
    return (
      <div className="flex min-h-24 w-36 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-space-700 p-3">
        <span className="font-display text-[0.55rem] text-starlight/50">Seat {seatNumber + 1}</span>
        {canSit ? (
          <button type="button" onClick={onSit} className="pixel-btn bg-neon-cyan text-ink">
            Sit here
          </button>
        ) : (
          <span className="text-xs text-starlight/40">Empty</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-lg p-2 ${isMe ? "bg-neon-magenta/5" : ""} ${
        waiting ? "ring-3 ring-neon-cyan" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <Avatar avatar={occupant.avatar} size={22} />
        <span className={`max-w-28 truncate text-sm ${isMe ? "text-neon-gold" : "text-starlight"}`}>
          {isMe ? "You" : occupant.username}
        </span>
        {waiting && secondsLeft !== null && (
          <span className={`font-display text-[0.6rem] ${secondsLeft <= 5 ? "text-neon-magenta" : "text-neon-cyan"}`}>
            {secondsLeft}s
          </span>
        )}
      </div>

      {roundSeat ? (
        <div className="flex flex-wrap justify-center gap-2">
          {roundSeat.hands.map((hand, i) => {
            const outcome = hand.outcome && revealed ? OUTCOME_LABELS[hand.outcome] : null;
            return (
              <div
                key={`${roundKey}-${i}`}
                className={`flex flex-col items-center gap-1.5 rounded-md p-1.5 ${
                  activeHand === i ? "bg-neon-cyan/10 ring-2 ring-neon-cyan" : ""
                }`}
              >
                <div className={`card-fan flex ${small ? "card-fan-sm" : ""}`}>
                  {hand.cards.map((card, c) => (
                    <DealtCard
                      key={`${c}-${card}`}
                      slot={playerSlot(roundSeat.playerId, i, c)}
                      card={card}
                      size={small ? "sm" : "md"}
                    />
                  ))}
                </div>
                <span className="min-h-3 font-display text-[0.65rem]">
                  {revealed ? totalLabel(hand.cards, hand.fromSplit) : " "}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="chip-token" title={`Bet: ${formatChips(hand.bet)}`}>
                    {formatChips(hand.bet)}
                  </span>
                  {outcome && (
                    <span className={`rounded px-1.5 py-0.5 font-display text-[0.55rem] ${outcome.style}`}>
                      {outcome.text}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : occupant.pendingBet !== null ? (
        <span className="chip-token" title="Bet for the next hand">
          {formatChips(occupant.pendingBet)}
        </span>
      ) : (
        <span className="text-xs text-starlight/50">{occupant.status === "sitting_out" ? "Sitting out" : "No bet yet"}</span>
      )}
    </div>
  );
}

/** A button that asks "are you sure?" inline (the browser's confirm dialog isn't used). */
function ConfirmButton({ label, confirmLabel, onConfirm }: { label: string; confirmLabel: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="rounded-md border-2 border-space-700 px-2.5 py-1 hover:border-neon-magenta"
      >
        {label}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        className="rounded-md border-2 border-neon-magenta px-2.5 py-1 text-neon-magenta"
      >
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="px-2 text-starlight/70 underline">
        Cancel
      </button>
    </span>
  );
}

function ResultLine({ net }: { net: number }) {
  if (net > 0) return <p className="font-display text-sm text-neon-gold">You won {formatChips(net)}!</p>;
  if (net < 0) return <p className="font-display text-sm text-starlight/80">You lost {formatChips(-net)}.</p>;
  return <p className="font-display text-sm text-starlight/80">Push: your bet is returned.</p>;
}
