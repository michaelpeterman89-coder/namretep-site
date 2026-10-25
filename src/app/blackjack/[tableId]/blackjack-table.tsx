"use client";

import { useState, useTransition } from "react";
import { CardBack, PlayingCard } from "@/components/playing-card";
import { formatChips } from "@/lib/chips";
import { handValue, isTwoCard21, type Card } from "@/lib/games/blackjack/cards";
import type { ActionType, PlayerHand, Seat } from "@/lib/games/blackjack/engine";
import { houseEdge, rulesSummary } from "@/lib/games/blackjack/rules";
import { actionLabel } from "@/lib/games/blackjack/strategy";
import { useStoredToggle } from "@/lib/use-stored-toggle";
import type { GameTable, RoundForPlayer } from "@/server/blackjack";
import { dealAction, playAction, type PlayResult } from "../actions";

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

export function BlackjackTable({
  table,
  initialRound,
  initialChips,
}: {
  table: GameTable;
  initialRound: RoundForPlayer | null;
  initialChips: number;
}) {
  const [round, setRound] = useState(initialRound);
  const [chips, setChips] = useState(initialChips);
  const [bet, setBet] = useState(Math.min(Math.max(table.minBet, 10), table.maxBet));
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hints, setHints] = useStoredToggle("namretep:hints", false);
  const [pending, startTransition] = useTransition();

  const { rules } = table;
  const view = round?.view;
  const seat = view && round.seat >= 0 ? view.seats[round.seat] : null;
  const inProgress = view && view.phase !== "settled";

  function apply(promise: Promise<PlayResult>) {
    startTransition(async () => {
      const result = await promise;
      if (result.round) setRound(result.round);
      const feedback = result.round?.feedback;
      setHint(
        hints && feedback && !feedback.onBook
          ? `Book play: ${actionLabel(feedback.bookAction)} (${feedback.situation})`
          : null,
      );
      setChips(result.chips);
      setError(result.ok ? null : (result.error ?? "Something went wrong."));
    });
  }

  function act(type: ActionType) {
    if (!round || pending) return;
    apply(playAction(table.id, round.roundId, round.version, type, hints));
  }

  function deal() {
    if (pending) return;
    if (bet < table.minBet || bet > table.maxBet) {
      setError(`Bet must be between ${formatChips(table.minBet)} and ${formatChips(table.maxBet)}.`);
      return;
    }
    if (bet > chips) {
      setError("You don't have enough chips for that bet.");
      return;
    }
    apply(dealAction(table.id, bet));
  }

  function actionCost(type: ActionType): number {
    if (!seat || !view) return 0;
    if (type === "insurance") return Math.floor(seat.baseBet / 2);
    if ((type === "double" || type === "split") && view.turn) return seat.hands[view.turn.hand].bet;
    return 0;
  }

  const chipSteps = [1, 5, 25, 100, 500, 1000].filter((c) => c <= table.maxBet);
  const playerHasBlackjack = seat ? isTwoCard21(seat.hands[0].cards) && !seat.hands[0].fromSplit : false;

  let status: string | null = null;
  if (view?.phase === "early") {
    status = view.dealer[0][0] === "A" ? "Dealer shows an ace." : "Dealer will check for blackjack.";
  } else if (view?.phase === "playing" && view.peeked) {
    status = "Dealer checked: no blackjack.";
  } else if (view?.phase === "settled" && view.dealerBlackjack) {
    status = "Dealer has blackjack.";
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
          <span className="font-display text-base text-neon-gold">{formatChips(chips)}</span>
        </p>
      </div>

      {/* Felt */}
      <section
        aria-label="Blackjack table"
        className="pixel-panel relative flex min-h-[24rem] flex-col items-center justify-between gap-6 overflow-hidden px-3 py-6 sm:px-6"
        style={{ background: "radial-gradient(ellipse at 50% 0%, #2a1a6e, var(--color-space-900) 70%)" }}
      >
        {/* Dealer */}
        <div className="flex flex-col items-center gap-2">
          <span className="font-display text-[0.6rem] text-starlight/60">Dealer</span>
          <div className="card-fan flex min-h-20 sm:min-h-28">
            {view?.dealer.map((card, i) => <PlayingCard key={`${i}-${card}`} card={card} index={i} />)}
            {view && Array.from({ length: view.dealerHidden }, (_, i) => <CardBack key={`back-${i}`} index={1} />)}
          </div>
          {view && (
            <span className="font-display text-xs text-starlight">
              {view.dealerHidden > 0 ? `Showing ${totalLabel(view.dealer)}` : totalLabel(view.dealer)}
            </span>
          )}
        </div>

        <p className="text-center font-display text-[0.55rem] leading-relaxed text-neon-gold/70 sm:text-[0.65rem]">
          Blackjack pays {rules.blackjackPayout.replace(":", " to ")} · Dealer {rules.dealerHitsSoft17 ? "hits" : "stands"} on
          soft 17
          {rules.insurance && " · Insurance pays 2 to 1"}
        </p>

        {/* Player */}
        <div className="flex w-full flex-wrap items-start justify-center gap-4 sm:gap-8">
          {seat ? (
            seat.hands.map((hand, i) => {
              const active = view?.phase === "playing" && view.turn?.hand === i;
              const outcome = hand.outcome ? OUTCOME_LABELS[hand.outcome] : null;
              return (
                <div
                  key={i}
                  className={`flex flex-col items-center gap-2 rounded-lg p-2 ${
                    active ? "bg-neon-cyan/10 ring-3 ring-neon-cyan" : ""
                  }`}
                >
                  <div className="card-fan flex">
                    {hand.cards.map((card, c) => (
                      <PlayingCard key={`${c}-${card}`} card={card} index={c} />
                    ))}
                  </div>
                  <span className="font-display text-xs">{totalLabel(hand.cards, hand.fromSplit)}</span>
                  <div className="flex items-center gap-2">
                    <span className="chip-token" title={`Bet: ${formatChips(hand.bet)}`}>
                      {formatChips(hand.bet)}
                    </span>
                    {outcome && (
                      <span className={`rounded px-2 py-1 font-display text-[0.6rem] ${outcome.style}`}>
                        {outcome.text}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="py-10 text-starlight/70">Place a bet to deal your first hand.</p>
          )}
        </div>
      </section>

      {/* Messages */}
      <div aria-live="polite" className="flex min-h-6 flex-col items-center gap-1 text-center">
        {view?.reshuffled && view.phase !== "settled" && (
          <p className="text-sm text-neon-cyan">The shoe was shuffled.</p>
        )}
        {status && <p className="text-sm text-starlight/80">{status}</p>}
        {seat && seat.insurance > 0 && (
          <p className="text-sm text-starlight/80">
            Insurance: {formatChips(seat.insurance)}
            {view?.phase === "settled" && ((seat.insuranceReturned ?? 0) > 0 ? " — paid!" : " — lost")}
          </p>
        )}
        {view?.phase === "settled" && seat && (
          <ResultLine net={seatNet(seat)} />
        )}
        {hint && (
          <p className="rounded border-2 border-neon-gold bg-neon-gold/10 px-3 py-1.5 text-sm text-starlight">
            {hint}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-neon-magenta">
            {error}
          </p>
        )}
      </div>

      {/* Controls */}
      <div className="pixel-panel flex flex-col items-center gap-4 p-4 sm:p-5">
        {inProgress ? (
          <div className="flex flex-wrap justify-center gap-3">
            {round!.actions.length === 0 && <p className="text-starlight/70">Waiting…</p>}
            {round!.actions.map((type) => {
              const cost = actionCost(type);
              const label = type === "insurance" && playerHasBlackjack ? "Even money" : ACTION_LABELS[type];
              return (
                <button
                  key={type}
                  type="button"
                  disabled={pending || cost > chips}
                  onClick={() => act(type)}
                  className={`pixel-btn disabled:opacity-50 ${ACTION_STYLES[type] ?? "bg-space-800 text-starlight"}`}
                >
                  {label}
                  {cost > 0 && <span className="ml-2 opacity-70">({formatChips(cost)})</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <>
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
                onClick={deal}
                disabled={pending}
                className="pixel-btn bg-neon-magenta text-ink disabled:opacity-60"
              >
                {pending ? "Dealing…" : "Deal"}
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
    </div>
  );
}

function ResultLine({ net }: { net: number }) {
  if (net > 0) return <p className="font-display text-sm text-neon-gold">You won {formatChips(net)}!</p>;
  if (net < 0) return <p className="font-display text-sm text-starlight/80">You lost {formatChips(-net)}.</p>;
  return <p className="font-display text-sm text-starlight/80">Push: your bet is returned.</p>;
}
