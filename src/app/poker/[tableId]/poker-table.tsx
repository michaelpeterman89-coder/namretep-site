"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { GuideLink } from "@/components/guide-link";
import { ChipStack } from "@/components/chip";
import { DealContext, DealtCard, EMPTY_PLAN, prefersReducedMotion, Shoe, type DealPlan } from "@/components/card-table/dealing";
import { cardLabel } from "@/components/playing-card";
import { TickingNumber } from "@/components/ticking-number";
import { formatChips } from "@/lib/chips";
import type { LogEntry, PublicHand, PublicSeat } from "@/lib/games/poker";
import { pokerSummary } from "@/lib/games/poker/table-rules";
import { playSound } from "@/lib/sound";
import { createClient } from "@/lib/supabase/client";
import type { PokerSeatView, PokerView } from "@/server/poker";
import {
  buyInAction,
  closePokerTableAction,
  leavePokerAction,
  pokerPlayAction,
  type PokerResult,
} from "../actions";
import { ChipRack } from "./chip-rack";
import { boardSlot, computePokerPlan, holeSlot } from "./poker-dealing";
import { seatPosition } from "./seat-layout";

type Synced = { view: PokerView; offset: number; plan: DealPlan; busyUntil: number };

async function loadTable(tableId: string, method: "GET" | "POST"): Promise<PokerView | null> {
  try {
    const response = await fetch(`/api/poker/${tableId}`, { method, cache: "no-store" });
    if (!response.ok) return null;
    return ((await response.json()) as PokerResult).view;
  } catch {
    return null;
  }
}

const handLike = (v: PokerView) => (v.hand ? { id: v.hand.id, view: v.hand.view } : null);

function actionLabel(entry: LogEntry | undefined): string | null {
  if (!entry) return null;
  if (entry.allIn && entry.amount > 0) return "All-in";
  switch (entry.action) {
    case "small-blind":
      return "Small blind";
    case "big-blind":
      return "Big blind";
    case "ante":
      return "Ante";
    case "fold":
      return "Fold";
    case "check":
      return "Check";
    case "call":
      return `Call ${formatChips(entry.amount)}`;
    case "bet":
      return `Bet ${formatChips(entry.amount)}`;
    case "raise":
      return "Raise";
  }
}

const secondsLeft = (deadline: string | null | undefined, serverNow: number) =>
  deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - serverNow) / 1000)) : null;

export function PokerTableView({ initialView }: { initialView: PokerView }) {
  const router = useRouter();
  const tableId = initialView.table.id;
  const [{ view, offset, plan, busyUntil }, setSynced] = useState<Synced>(() => ({
    view: initialView,
    offset: new Date(initialView.serverNow).getTime() - Date.now(),
    plan: EMPTY_PLAN,
    busyUntil: 0,
  }));
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [raiseTo, setRaiseTo] = useState(0);
  const [buying, setBuying] = useState<{ seat: number; amount: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const shoeRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const latestAt = useRef(initialView.serverNow);
  const headerChips = useRef(initialView.me.chips);

  const accept = useCallback((next: PokerView | null) => {
    if (!next || next.serverNow < latestAt.current) return;
    latestAt.current = next.serverNow;
    const receivedAt = Date.now();
    const reduced = prefersReducedMotion();
    setSynced((prev) => {
      const nextPlan = computePokerPlan(handLike(prev.view), handLike(next), reduced);
      return {
        view: next,
        offset: new Date(next.serverNow).getTime() - receivedAt,
        plan: nextPlan,
        busyUntil: nextPlan.durationMs > 0 ? receivedAt + nextPlan.durationMs : prev.busyUntil,
      };
    });
  }, []);

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
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = supabase
        .channel(`poker-${tableId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "game_tables", filter: `id=eq.${tableId}` },
          () => void refetch(),
        )
        .subscribe();
    })();
    const backup = setInterval(() => {
      if (document.visibilityState === "visible") void refetch();
    }, 10_000);
    return () => {
      cancelled = true;
      clearInterval(backup);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [tableId, refetch]);

  // ---------- Clocks ----------

  const hand = view.hand;
  const hv: PublicHand | null = hand?.view ?? null;
  const active = hv?.phase === "betting";
  const deadline = active ? hand!.deadline : view.nextHandAt;
  const left = secondsLeft(deadline, now + offset);
  const busy = now < busyUntil;

  useEffect(() => {
    if (!deadline && Date.now() >= busyUntil) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (!deadline && t >= busyUntil) clearInterval(timer);
    }, 200);
    return () => clearInterval(timer);
  }, [deadline, busyUntil]);

  // A countdown hit zero: bots act, timeouts happen, or the next hand is dealt.
  const lastTick = useRef<{ deadline: string; at: number } | null>(null);
  useEffect(() => {
    if (!deadline || left === null || left > 0) return;
    const last = lastTick.current;
    if (last && last.deadline === deadline && Date.now() - last.at < 2000) return;
    lastTick.current = { deadline, at: Date.now() };
    const timer = setTimeout(async () => accept(await loadTable(tableId, "POST")), Math.random() * 300);
    return () => clearTimeout(timer);
  }, [deadline, left, tableId, accept]);

  // The header's chip count follows buy-ins and cash-outs.
  useEffect(() => {
    if (view.me.chips !== headerChips.current) {
      headerChips.current = view.me.chips;
      router.refresh();
    }
  }, [view.me.chips, router]);

  // ---------- Who's who ----------

  const { table, seats, me } = view;
  const mySeatInfo = seats.find((s) => s.seatNumber === me.seatNumber) ?? null;
  const myIndex = hand?.mySeat ?? -1;
  const meInHand: PublicSeat | null = hv && myIndex >= 0 ? hv.seats[myIndex] : null;
  const options = active && !busy ? (hand?.options ?? null) : null;
  const actor = active && hv!.toAct !== null ? hv!.seats[hv!.toAct] : null;
  const actorInfo = actor ? seats.find((s) => s.playerId === actor.playerId) : null;
  const bottomSeat = me.seatNumber ?? 0;
  const nameOf = (playerId: string) =>
    playerId === me.playerId ? "You" : (seats.find((s) => s.playerId === playerId)?.username ?? "A player who left");
  const handIndexOfSeat = (seatNumber: number) => (hand ? hand.seatNumbers.indexOf(seatNumber) : -1);

  // Raise slider follows the legal range as it changes.
  const raiseMin = options?.raise?.min ?? 0;
  const raiseMax = options?.raise?.max ?? 0;
  const raiseValue = Math.min(Math.max(raiseTo, raiseMin), raiseMax);

  // ---------- Actions ----------

  function apply(request: Promise<PokerResult>, after?: (r: PokerResult) => void) {
    startTransition(async () => {
      const result = await request;
      accept(result.view);
      setError(result.ok ? null : (result.error ?? "Something went wrong."));
      after?.(result);
    });
  }

  function act(type: "fold" | "check" | "call" | "raise", amount?: number) {
    if (!hand || !options || pending) return;
    if (type !== "fold" && type !== "check") playSound("chip");
    apply(pokerPlayAction(tableId, hand.id, hand.version, type, amount ?? null));
  }

  function potFraction(fraction: number) {
    if (!hv || !options?.raise) return raiseMin;
    const potAfterCall = hv.pot + options.call;
    return Math.round(hv.currentBet + potAfterCall * fraction);
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

  // ---------- Sounds ----------

  const logLength = hv?.log.length ?? 0;
  const lastLog = useRef<{ hand: string | null; length: number }>({ hand: null, length: 0 });
  useEffect(() => {
    const prev = lastLog.current;
    lastLog.current = { hand: hand?.id ?? null, length: logLength };
    if (!hv || prev.hand !== hand?.id || logLength <= prev.length) return;
    // Clink when chips go in (not for our own moves; those clink on click).
    const added = hv.log.slice(prev.length).some((e) => e.amount > 0 && hv.seats[e.seat].playerId !== me.playerId);
    if (added) playSound("chip");
  }, [hand?.id, hv, logLength, me.playerId]);

  const myTurn = Boolean(options);
  const wasMyTurn = useRef(false);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current) playSound("turn");
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  const finished = hv?.phase === "complete" && !busy;
  const myNet = finished && hv && myIndex >= 0 && hv.result ? hv.result.payouts[myIndex] - hv.seats[myIndex].total : null;
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (myNet === null || !hand || announced.current === hand.id) return;
    announced.current = hand.id;
    if (myNet !== 0) playSound(myNet > 0 ? "win" : "lose");
  }, [myNet, hand]);

  // ---------- Keyboard ----------

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || !options) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const key = e.key.toLowerCase();
      if (key === "f" && options.fold) act("fold");
      else if (key === "c") act(options.check ? "check" : "call");
      else if (key === "r" && options.raise) act("raise", raiseValue);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- Screen reader summary ----------

  const srSummary = (() => {
    if (!hv) return me.seatNumber === null ? "Pick an open seat to buy in." : "Waiting for another player.";
    if (busy) return "Dealing.";
    const parts: string[] = [];
    if (meInHand && meInHand.hole.length > 0) parts.push(`Your cards: ${meInHand.hole.map(cardLabel).join(", ")}.`);
    parts.push(hv.board.length > 0 ? `Board: ${hv.board.map(cardLabel).join(", ")}.` : "No board cards yet.");
    parts.push(`Pot ${formatChips(hv.pot)}.`);
    if (options) {
      parts.push(options.check ? "Your move: you can check." : `Your move: ${formatChips(options.call)} to call.`);
    } else if (actor) {
      parts.push(`Waiting for ${nameOf(actor.playerId)}.`);
    }
    if (finished && myNet !== null) parts.push(myNet > 0 ? `You won ${formatChips(myNet)}.` : myNet < 0 ? `You lost ${formatChips(-myNet)}.` : "");
    return parts.join(" ");
  })();

  if (table.status === "closed") {
    return (
      <div className="pixel-panel mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <h1 className="font-display text-base text-starlight">{table.name}</h1>
        <p className="text-starlight/70">This table was closed by its host.</p>
        <button type="button" onClick={() => router.push("/poker")} className="pixel-btn bg-neon-cyan text-ink">
          Find another table
        </button>
      </div>
    );
  }

  const results = finished && hv?.result ? hv.result.pots : [];

  return (
    <div className="flex flex-col gap-5">
      {/* Table info */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="font-display text-base text-starlight sm:text-lg">{table.name}</h1>
            <GuideLink game="holdem" />
          </div>
          <p className="text-sm text-starlight/70">
            <span className="font-display text-[0.6rem] text-neon-gold">{pokerSummary(table.rules)}</span>
            {" · "}Buy-in {formatChips(table.rules.minBuyIn)}–{formatChips(table.rules.maxBuyIn)}
          </p>
        </div>
        <p className="flex items-baseline gap-2">
          <span className="text-sm text-starlight/70">Balance</span>
          <span className="font-display text-base text-neon-gold">
            <TickingNumber value={me.chips} />
          </span>
        </p>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {srSummary}
      </p>

      {/* The table */}
      <DealContext value={{ shoeRef, discardRef, trayRef, plan, settlement: null }}>
        <section aria-label="Poker table" className="relative mx-auto aspect-[4/5] w-full max-w-5xl sm:aspect-[16/9]">
          <div className="poker-felt absolute inset-x-[6%] inset-y-[9%]" />
          {/* The house: chip rack at the top centre, deck beside it. Seats leave this spot free. */}
          <ChipRack className="top-[7%] left-1/2 -translate-x-1/2 sm:top-[11%]" />
          <Shoe
            cardsLeft={null}
            className="top-[18%] left-1/2 -translate-x-1/2 sm:top-[12%] sm:left-[calc(50%+6.25rem)] sm:translate-x-0"
          />

          {/* Board and pot */}
          <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
            <div className="flex gap-1 sm:gap-1.5">
              {Array.from({ length: 5 }, (_, i) =>
                hv && hv.board[i] ? (
                  <DealtCard key={`${hand!.id}-b${i}`} slot={boardSlot(i)} card={hv.board[i]} size="sm" />
                ) : (
                  <div key={i} className="h-16 w-11 rounded-md border-2 border-dashed border-neon-gold/30 sm:h-20 sm:w-14" />
                ),
              )}
            </div>
            {hv && hv.pot > 0 && (
              <div className="flex items-center gap-2">
                <ChipStack amount={hv.pot} size="sm" showTotal={false} />
                <span className="font-display text-xs text-neon-gold">Pot {formatChips(hv.pot)}</span>
              </div>
            )}
            {results.length > 0 && (
              <div className="max-w-[16rem] rounded-md bg-ink/70 px-3 py-2 text-center text-xs text-starlight sm:max-w-xs">
                {results.map((pot, i) => (
                  <p key={i}>
                    <span className="text-neon-gold">{pot.winners.map((w) => nameOf(hv!.seats[w].playerId)).join(" & ")}</span>{" "}
                    {pot.winners.length > 1 ? "split" : pot.winners[0] === myIndex ? "win" : "wins"} {formatChips(pot.amount)}
                    {pot.hand ? ` with ${pot.hand}` : pot.eligible.length === 1 && results.length > 1 ? " (returned)" : ""}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Seats */}
          {Array.from({ length: table.seats }, (_, seatNumber) => {
            const occupant = seats.find((s) => s.seatNumber === seatNumber) ?? null;
            const index = handIndexOfSeat(seatNumber);
            const inHand = hv && index >= 0 ? hv.seats[index] : null;
            const position = seatPosition(seatNumber, table.seats, bottomSeat);
            const betPosition = seatPosition(seatNumber, table.seats, bottomSeat, 0.58);
            const lastEntry = hv && index >= 0 ? [...hv.log].reverse().find((e) => e.seat === index && e.street === hv.street) : undefined;
            return (
              <div key={seatNumber}>
                <div className="around absolute -translate-x-1/2 -translate-y-1/2" style={position}>
                  <PokerSeat
                    seatNumber={seatNumber}
                    occupant={occupant}
                    inHand={inHand}
                    handId={hand?.id ?? ""}
                    isMe={occupant?.playerId === me.playerId}
                    isButton={Boolean(hv && index === hv.button)}
                    isActing={Boolean(actor && occupant && actor.playerId === occupant.playerId)}
                    secondsLeft={actor && occupant && actor.playerId === occupant.playerId && !occupant.isBot ? left : null}
                    lastAction={inHand?.folded ? "Folded" : finished && hv?.result?.hands[index] ? hv.result.hands[index] : actionLabel(lastEntry)}
                    winner={Boolean(finished && hv?.result?.pots.some((p) => p.winners.includes(index) && p.hand))}
                    canSit={me.seatNumber === null && !pending}
                    onSit={() =>
                      setBuying({
                        seat: seatNumber,
                        amount: Math.min(table.rules.maxBuyIn, Math.max(table.rules.minBuyIn, Math.floor(me.chips / 2))),
                      })
                    }
                  />
                </div>
                {inHand && inHand.committed > 0 && active && (
                  <div className="around absolute -translate-x-1/2 -translate-y-1/2" style={betPosition}>
                    <ChipStack amount={inHand.committed} size="sm" />
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </DealContext>

      {error && (
        <p role="alert" className="text-center text-sm text-neon-magenta">
          {error}
        </p>
      )}

      {/* Controls */}
      <div className="pixel-panel flex flex-col items-center gap-4 p-4 sm:p-5">
        {buying ? (
          <BuyInPanel
            seat={buying.seat}
            amount={buying.amount}
            min={table.rules.minBuyIn}
            max={Math.min(table.rules.maxBuyIn, me.chips)}
            chips={me.chips}
            pending={pending}
            onChange={(amount) => setBuying({ ...buying, amount })}
            onCancel={() => setBuying(null)}
            onConfirm={() => apply(buyInAction(tableId, buying.seat, buying.amount), (r) => r.ok && setBuying(null))}
          />
        ) : !mySeatInfo ? (
          <p className="text-center text-starlight/80">
            You&apos;re watching. {seats.length < table.seats ? "Click Sit at an open seat to buy in." : "Every seat is taken."}
          </p>
        ) : options ? (
          <>
            {left !== null && (
              <p className={`font-display text-xs ${left <= 5 ? "text-neon-magenta" : "text-neon-cyan"}`}>Your move · {left}s</p>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              {options.fold && (
                <button type="button" disabled={pending} onClick={() => act("fold")} className="pixel-btn bg-space-800 text-starlight">
                  Fold<kbd className="kbd" aria-hidden>F</kbd>
                </button>
              )}
              {options.check ? (
                <button type="button" disabled={pending} onClick={() => act("check")} className="pixel-btn bg-neon-cyan text-ink">
                  Check<kbd className="kbd" aria-hidden>C</kbd>
                </button>
              ) : (
                <button type="button" disabled={pending} onClick={() => act("call")} className="pixel-btn bg-neon-cyan text-ink">
                  {options.call >= (meInHand?.stack ?? 0) ? "All-in" : "Call"} {formatChips(options.call)}
                  <kbd className="kbd" aria-hidden>C</kbd>
                </button>
              )}
              {options.raise && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act("raise", raiseValue)}
                  className="pixel-btn bg-neon-magenta text-ink"
                >
                  {raiseValue >= raiseMax ? "All-in" : hv!.currentBet === 0 ? "Bet" : "Raise to"} {formatChips(raiseValue)}
                  <kbd className="kbd" aria-hidden>R</kbd>
                </button>
              )}
            </div>
            {options.raise && (
              <div className="flex w-full max-w-md flex-col gap-2">
                <div className="flex flex-wrap justify-center gap-2 text-xs">
                  {[
                    ["Min", raiseMin],
                    ["½ Pot", potFraction(0.5)],
                    ["¾ Pot", potFraction(0.75)],
                    ["Pot", potFraction(1)],
                    ["All-in", raiseMax],
                  ].map(([label, value]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setRaiseTo(Number(value))}
                      className="rounded-md border-2 border-space-700 px-2 py-1 hover:border-neon-magenta"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-3">
                  <span className="sr-only">Raise amount</span>
                  <input
                    type="range"
                    min={raiseMin}
                    max={raiseMax}
                    step={table.rules.smallBlind}
                    value={raiseValue}
                    onChange={(e) => setRaiseTo(Number(e.target.value))}
                    className="flex-1 accent-neon-magenta"
                  />
                  <input
                    type="number"
                    min={raiseMin}
                    max={raiseMax}
                    value={raiseValue}
                    onChange={(e) => setRaiseTo(Math.floor(Number(e.target.value) || 0))}
                    className="pixel-input w-28"
                  />
                </label>
              </div>
            )}
          </>
        ) : active ? (
          <p className="text-center text-starlight/80">
            {actor ? (
              <>
                Waiting for {nameOf(actor.playerId)}
                {actorInfo?.isBot ? " (thinking…)" : left !== null ? ` · ${left}s` : ""}
              </>
            ) : (
              "Dealing…"
            )}
          </p>
        ) : hv?.phase === "complete" ? (
          <p className="text-center text-starlight/80">
            {myNet !== null && myNet !== 0 && (
              <span className={`font-display text-sm ${myNet > 0 ? "text-neon-gold" : "text-starlight"}`}>
                {myNet > 0 ? `+${formatChips(myNet)} this hand · ` : `−${formatChips(-myNet)} this hand · `}
              </span>
            )}
            {left !== null && left > 0 ? `Next hand in ${left}s` : "Shuffling…"}
          </p>
        ) : (
          <p className="text-center text-starlight/80">Waiting for another player to sit down…</p>
        )}
      </div>

      {/* Table management */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        {mySeatInfo && (
          <span className="text-starlight/80">
            Your stack:{" "}
            <span className="font-display text-xs text-neon-gold">
              {formatChips(seats.find((s) => s.playerId === me.playerId)?.liveStack ?? 0)}
            </span>
          </span>
        )}
        {table.inviteCode && (
          <span className="flex flex-wrap items-center gap-2 text-starlight/80">
            Invite code <span className="font-display text-xs text-neon-gold">{table.inviteCode}</span>
            <button type="button" onClick={copyInvite} className="rounded-md border-2 border-space-700 px-2.5 py-1 hover:border-neon-gold">
              {copied ? "Link copied!" : "Copy invite link"}
            </button>
          </span>
        )}
        {mySeatInfo && (
          <button
            type="button"
            disabled={pending || mySeatInfo.leaving}
            onClick={() => apply(leavePokerAction(tableId))}
            className="rounded-md border-2 border-space-700 px-2.5 py-1 hover:border-neon-magenta"
          >
            {mySeatInfo.leaving ? "Leaving after this hand…" : "Leave table"}
          </button>
        )}
        {me.isOwner && !active && (
          <CloseButton
            onConfirm={() =>
              startTransition(async () => {
                const result = await closePokerTableAction(tableId);
                if (result.ok) router.push("/poker");
                else {
                  accept(result.view);
                  setError(result.error ?? "Something went wrong.");
                }
              })
            }
          />
        )}
      </div>
    </div>
  );
}

function PokerSeat({
  seatNumber,
  occupant,
  inHand,
  handId,
  isMe,
  isButton,
  isActing,
  secondsLeft,
  lastAction,
  winner,
  canSit,
  onSit,
}: {
  seatNumber: number;
  occupant: PokerSeatView | null;
  inHand: PublicSeat | null;
  handId: string;
  isMe: boolean;
  isButton: boolean;
  isActing: boolean;
  secondsLeft: number | null;
  lastAction: string | null;
  winner: boolean;
  canSit: boolean;
  onSit: () => void;
}) {
  if (!occupant) {
    return canSit ? (
      <button
        type="button"
        onClick={onSit}
        aria-label={`Sit in seat ${seatNumber + 1}`}
        className="pixel-btn bg-neon-cyan px-2 py-1.5 text-[0.55rem] text-ink"
      >
        Sit
      </button>
    ) : (
      <span className="block h-8 w-8 rounded-full border-2 border-dashed border-space-700" aria-hidden />
    );
  }

  const folded = inHand?.folded ?? false;
  return (
    <div
      className={`flex w-[4.6rem] flex-col items-center gap-1 rounded-lg p-1 sm:w-28 ${
        isActing ? "bg-neon-cyan/15 ring-3 ring-neon-cyan" : winner ? "ring-3 ring-neon-gold" : ""
      } ${folded ? "opacity-50" : ""}`}
    >
      {inHand && inHand.holeCount > 0 && !folded && (
        // On phones, opponents' face-down cards are hidden to save space.
        <div className={`card-fan card-fan-sm ${isMe || inHand.hole.length > 0 ? "flex" : "hidden sm:flex"}`}>
          {Array.from({ length: inHand.holeCount }, (_, i) => (
            <DealtCard key={`${handId}-${i}`} slot={holeSlot(inHand.playerId, i)} card={inHand.hole[i] ?? null} size="sm" />
          ))}
        </div>
      )}
      <div className={`flex w-full flex-col items-center rounded-md border-2 px-1.5 py-1 ${isMe ? "border-neon-gold bg-space-950/90" : "border-space-700 bg-space-950/80"}`}>
        <span className="flex max-w-full items-center gap-1">
          <span className="hidden sm:inline-flex">
            <Avatar avatar={occupant.avatar} size={14} />
          </span>
          <span className={`truncate text-[0.7rem] ${isMe ? "text-neon-gold" : "text-starlight"}`}>{isMe ? "You" : occupant.username}</span>
          {occupant.isBot && <span className="font-display text-[0.45rem] text-neon-cyan">BOT</span>}
          {isButton && (
            <span className="ml-0.5 rounded-full bg-starlight px-1 font-display text-[0.45rem] text-ink" title="Dealer button">
              D
            </span>
          )}
        </span>
        <span className="font-display text-[0.6rem] text-neon-gold">{formatChips(occupant.liveStack ?? 0)}</span>
        {inHand?.allIn && !folded && <span className="font-display text-[0.5rem] text-neon-magenta">ALL-IN</span>}
        {lastAction && <span className="max-w-full truncate text-[0.6rem] text-starlight/80">{lastAction}</span>}
        {isActing && secondsLeft !== null && (
          <span className={`font-display text-[0.55rem] ${secondsLeft <= 5 ? "text-neon-magenta" : "text-neon-cyan"}`}>{secondsLeft}s</span>
        )}
        {occupant.leaving && <span className="text-[0.55rem] text-starlight/70">Leaving</span>}
      </div>
    </div>
  );
}

function BuyInPanel({
  seat,
  amount,
  min,
  max,
  chips,
  pending,
  onChange,
  onCancel,
  onConfirm,
}: {
  seat: number;
  amount: number;
  min: number;
  max: number;
  chips: number;
  pending: boolean;
  onChange: (amount: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (chips < min) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-starlight/80">
          You need at least {formatChips(min)} chips to sit here. You have {formatChips(chips)}.
        </p>
        <button type="button" onClick={onCancel} className="rounded-md border-2 border-space-700 px-3 py-1">
          OK
        </button>
      </div>
    );
  }
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <p className="text-center font-display text-xs text-neon-cyan">Buy in at seat {seat + 1}</p>
      <label className="flex items-center gap-3">
        <span className="sr-only">Buy-in amount</span>
        <input
          type="range"
          min={min}
          max={max}
          step={Math.max(1, Math.round(min / 10))}
          value={Math.min(Math.max(amount, min), max)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-neon-gold"
        />
        <input
          type="number"
          min={min}
          max={max}
          value={amount}
          onChange={(e) => onChange(Math.floor(Number(e.target.value) || 0))}
          className="pixel-input w-28"
        />
      </label>
      <p className="text-center text-xs text-starlight/70">
        {formatChips(min)}–{formatChips(max)} chips · You have {formatChips(chips)}
      </p>
      <div className="flex justify-center gap-3">
        <button type="button" disabled={pending} onClick={onConfirm} className="pixel-btn bg-neon-gold text-ink">
          Buy in {formatChips(amount)}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border-2 border-space-700 px-3 py-1">
          Cancel
        </button>
      </div>
    </div>
  );
}

function CloseButton({ onConfirm }: { onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="rounded-md border-2 border-space-700 px-2.5 py-1 hover:border-neon-magenta">
        Close table
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
        Yes, close it (everyone is cashed out)
      </button>
      <button type="button" onClick={() => setAsking(false)} className="px-2 text-starlight/70 underline">
        Cancel
      </button>
    </span>
  );
}
