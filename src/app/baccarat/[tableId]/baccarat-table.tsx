"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { GuideLink } from "@/components/guide-link";
import {
  DealContext,
  DealtCard,
  EMPTY_PLAN,
  prefersReducedMotion,
  Shoe,
  type DealPlan,
  type PlanEntry,
} from "@/components/card-table/dealing";
import { Chip, ChipStack, DENOMINATIONS } from "@/components/chip";
import { cardLabel } from "@/components/playing-card";
import { TickingNumber } from "@/components/ticking-number";
import { formatChips } from "@/lib/chips";
import {
  baccaratSummary,
  beadPlate,
  betNotOffered,
  bigRoad,
  describeHand,
  handTotal,
  HAND_PAUSE_MS,
  roadCounts,
  ROAD_ROWS,
  type BaccaratBetKind,
  type RoadResult,
} from "@/lib/games/baccarat";
import { playSound, playSoundAt } from "@/lib/sound";
import { createClient } from "@/lib/supabase/client";
import type { BaccaratView } from "@/server/baccarat";
import {
  baccaratBetAction,
  baccaratClearAction,
  baccaratDealAction,
  baccaratLeaveAction,
  baccaratRebetAction,
  baccaratSitAction,
  closeBaccaratTableAction,
  type BaccaratResult,
} from "../actions";
import { baccaratTimeline, bankerSlot, playerSlot, type Timeline } from "./baccarat-dealing";

async function loadTable(tableId: string, method: "GET" | "POST"): Promise<BaccaratView | null> {
  try {
    const res = await fetch(`/api/baccarat/${tableId}`, { method, cache: "no-store" });
    const body = (await res.json()) as { view: BaccaratView | null };
    return body.view;
  } catch {
    return null;
  }
}

/** How long the result stays on the felt after the cards are done. */
const RESULT_HOLD_MS = 3_000;

const COLORS = {
  player: { text: "text-neon-cyan", border: "border-neon-cyan", bg: "bg-neon-cyan" },
  banker: { text: "text-neon-magenta", border: "border-neon-magenta", bg: "bg-neon-magenta" },
  tie: { text: "text-neon-lime", border: "border-neon-lime", bg: "bg-neon-lime" },
} as const;

type Spot = { kind: BaccaratBetKind; label: string; pays: string; color?: keyof typeof COLORS };

// ---------- Scoreboards ----------

function RoadDot({ r, filled }: { r: { winner: "player" | "banker" | "tie"; playerPair: boolean; bankerPair: boolean }; filled: boolean }) {
  const c = COLORS[r.winner];
  return (
    <span
      className={`relative grid size-5 place-items-center rounded-full border-2 text-[0.5rem] font-bold sm:size-6 ${c.border} ${
        filled ? `${c.bg} text-ink` : c.text
      }`}
    >
      {filled ? (r.winner === "player" ? "P" : r.winner === "banker" ? "B" : "T") : ""}
      {r.bankerPair && <span className="absolute -top-0.5 -left-0.5 size-1.5 rounded-full bg-neon-magenta ring-1 ring-ink" />}
      {r.playerPair && <span className="absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full bg-neon-cyan ring-1 ring-ink" />}
    </span>
  );
}

function Roads({ history }: { history: RoadResult[] }) {
  const bead = beadPlate(history);
  const big = bigRoad(history);
  const bigCols = Math.max(12, ...big.map((c) => c.col + 1));
  const counts = roadCounts(history);
  const beadRef = useRef<HTMLDivElement>(null);
  const bigRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const el of [beadRef.current, bigRef.current]) if (el) el.scrollLeft = el.scrollWidth;
  }, [history.length]);

  return (
    <section aria-label="Scoreboards" className="pixel-panel flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xs text-neon-gold">This shoe</h2>
        <p className="flex gap-3 text-xs">
          <span className="text-neon-magenta">Banker {counts.banker}</span>
          <span className="text-neon-cyan">Player {counts.player}</span>
          <span className="text-neon-lime">Tie {counts.tie}</span>
        </p>
      </div>
      {history.length === 0 ? (
        <p className="text-sm text-starlight/70">The scoreboards fill in as hands are dealt from this shoe.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-[auto_1fr]">
          <div>
            <p className="mb-1 text-[0.65rem] text-starlight/60">Bead Plate</p>
            <div ref={beadRef} className="max-w-full overflow-x-auto md:max-w-72">
              <div className="grid w-max grid-flow-col gap-0.5" style={{ gridTemplateRows: `repeat(${ROAD_ROWS}, auto)` }}>
                {bead.flatMap((col, c) =>
                  Array.from({ length: ROAD_ROWS }, (_, r) =>
                    col[r] ? <RoadDot key={`${c}-${r}`} r={col[r]} filled /> : <span key={`${c}-${r}`} className="size-5 sm:size-6" />,
                  ),
                )}
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[0.65rem] text-starlight/60">Big Road</p>
            <div ref={bigRef} className="overflow-x-auto">
              <div
                className="grid w-max gap-0.5"
                style={{ gridTemplateRows: `repeat(${ROAD_ROWS}, auto)`, gridTemplateColumns: `repeat(${bigCols}, auto)` }}
              >
                {Array.from({ length: bigCols * ROAD_ROWS }, (_, i) => {
                  const col = Math.floor(i / ROAD_ROWS);
                  const row = i % ROAD_ROWS;
                  const cell = big.find((c) => c.col === col && c.row === row);
                  return (
                    <span
                      key={i}
                      style={{ gridColumn: col + 1, gridRow: row + 1 }}
                      className="relative grid size-5 place-items-center border border-space-700/60 sm:size-6"
                    >
                      {cell && <RoadDot r={cell} filled={false} />}
                      {cell && cell.ties > 0 && (
                        <span className="absolute inset-0 grid place-items-center text-[0.6rem] font-bold text-neon-lime">
                          {cell.ties > 1 ? cell.ties : "/"}
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- The table ----------

export function BaccaratTableView({ initialView }: { initialView: BaccaratView }) {
  const router = useRouter();
  const tableId = initialView.table.id;
  const [view, setView] = useState(initialView);
  const [offset, setOffset] = useState(() => new Date(initialView.serverNow).getTime() - Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [dealing, setDealing] = useState<{ n: number; startedAt: number; timeline: Timeline; plan: DealPlan } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [chip, setChip] = useState(() => Math.max(initialView.table.minBet, 1));
  const [confirmClose, setConfirmClose] = useState(false);
  const [copied, setCopied] = useState(false);
  const latestAt = useRef(initialView.serverNow);
  const shownHand = useRef(initialView.game.state.lastHand?.n ?? 0);
  const shoeRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const headerChips = useRef(initialView.me.chips);

  const accept = useCallback((next: BaccaratView | null) => {
    if (!next || next.serverNow < latestAt.current) return;
    latestAt.current = next.serverNow;
    setOffset(new Date(next.serverNow).getTime() - Date.now());
    const last = next.game.state.lastHand;
    if (last && last.n > shownHand.current) {
      shownHand.current = last.n;
      if (!prefersReducedMotion()) {
        const timeline = baccaratTimeline(last.hand);
        const entries = new Map<string, PlanEntry>();
        // The first four fly out as soon as the hand arrives; third cards fly when they appear.
        for (const [slot, at] of timeline.dealAt) entries.set(slot, { delay: at < timeline.revealPlayerAt ? at : 0, kind: "deal" });
        playSoundAt("flip", timeline.revealPlayerAt);
        playSoundAt("flip", timeline.revealBankerAt);
        setDealing({ n: last.n, startedAt: Date.now(), timeline, plan: { entries, durationMs: timeline.doneAt } });
      }
    }
    setView(next);
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
        .channel(`baccarat-${tableId}`)
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

  const { table, seats, game, me } = view;
  const state = game.state;
  const last = state.lastHand;
  const elapsed = dealing ? now - dealing.startedAt : Infinity;
  const tl = dealing?.timeline;
  const dealingNow = Boolean(dealing && tl && elapsed < tl.doneAt);
  const showingResult = !dealingNow && Boolean(last) && (!dealing || elapsed < (tl?.doneAt ?? 0) + RESULT_HOLD_MS);
  const serverNow = now + offset;
  const dealAt = game.dealAt ? new Date(game.dealAt).getTime() : null;
  const secondsToDeal = dealAt ? Math.max(0, Math.ceil((dealAt - serverNow) / 1000)) : null;
  const pauseEnds = state.dealtAt ? new Date(state.dealtAt).getTime() + HAND_PAUSE_MS : 0;
  const secondsToNext = Math.max(0, Math.ceil((pauseEnds - serverNow) / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), dealingNow ? 100 : 250);
    return () => clearInterval(timer);
  }, [dealingNow]);

  // The countdown ran out: ask the server to deal.
  const lastTick = useRef(0);
  useEffect(() => {
    if (!dealAt || serverNow < dealAt || Date.now() - lastTick.current < 3000) return;
    lastTick.current = Date.now();
    void loadTable(tableId, "POST").then(accept);
  }, [dealAt, serverNow, tableId, accept]);

  // ---------- Who's who ----------

  const seated = me.seatNumber !== null;
  const myLast = useMemo(() => (last ? last.results.filter((r) => r.playerId === me.playerId) : []), [last, me.playerId]);
  const myNet = myLast.reduce((s, r) => s + r.credit - r.amount, 0);
  const myCredit = myLast.reduce((s, r) => s + r.credit, 0);
  const myBets = state.bets.filter((b) => b.playerId === me.playerId);
  const iAmReady = state.ready.includes(me.playerId);
  const othersSeated = seats.length > 1;
  // Until the cards land, the balance doesn't show this hand's winnings yet.
  const shownChips = dealingNow ? me.chips - myCredit : me.chips;

  // Sounds and the header balance when the result lands.
  const announced = useRef(initialView.game.state.lastHand?.n ?? 0);
  useEffect(() => {
    if (!last || dealingNow || announced.current >= last.n) return;
    announced.current = last.n;
    if (myLast.length > 0) playSound(myNet > 0 ? "win" : myNet < 0 ? "lose" : "push");
  }, [last, dealingNow, myLast.length, myNet]);

  useEffect(() => {
    if (!dealingNow && me.chips !== headerChips.current) {
      headerChips.current = me.chips;
      router.refresh();
    }
  }, [me.chips, dealingNow, router]);

  // ---------- Actions ----------

  function apply(request: Promise<BaccaratResult>) {
    startTransition(async () => {
      const result = await request;
      accept(result.view);
      setError(result.ok ? null : (result.error ?? "Something went wrong."));
    });
  }

  function bet(kind: BaccaratBetKind) {
    if (!seated) {
      setError("Take a seat to bet.");
      return;
    }
    playSound("chip");
    apply(baccaratBetAction(tableId, kind, chip));
  }

  const canDeal = seated && myBets.length > 0 && !dealingNow && !pending && secondsToNext === 0 && !iAmReady;
  function deal() {
    if (canDeal) apply(baccaratDealAction(tableId));
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.key === "d" || e.key === "D") && canDeal) {
        e.preventDefault();
        deal();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- What's on the felt ----------

  const r = table.rules;
  const spots: Spot[] = [
    { kind: "player", label: "Player", pays: "1:1", color: "player" },
    { kind: "tie", label: "Tie", pays: `${r.tiePays}:1`, color: "tie" },
    {
      kind: "banker",
      label: "Banker",
      pays: r.variant === "classic" ? "19:20" : r.variant === "super6" ? "1:1 · 6 pays ½" : "1:1 · 3-card 7 push",
      color: "banker",
    },
  ];
  const sides: Spot[] = (
    [
      { kind: "playerPair", label: "Player Pair", pays: "11:1" },
      { kind: "bankerPair", label: "Banker Pair", pays: "11:1" },
      { kind: "eitherPair", label: "Either Pair", pays: "5:1" },
      { kind: "perfectPair", label: "Perfect Pair", pays: "25:1" },
      { kind: "dragonPlayer", label: "Dragon · Player", pays: "up to 30:1" },
      { kind: "dragonBanker", label: "Dragon · Banker", pays: "up to 30:1" },
      { kind: "dragon7", label: "Dragon 7", pays: "40:1" },
      { kind: "panda8", label: "Panda 8", pays: "25:1" },
      { kind: "big", label: "Big", pays: "0.54:1" },
      { kind: "small", label: "Small", pays: "1.5:1" },
    ] as Spot[]
  ).filter((s) => !betNotOffered(r, s.kind));

  /** Chips on a spot: while a hand is out, the bets that were in it; otherwise the bets for the next hand. */
  function onSpot(kind: BaccaratBetKind) {
    const source = dealingNow && last ? last.results : state.bets;
    let mine = 0;
    let others = 0;
    for (const b of source) {
      if (b.kind !== kind) continue;
      if (b.playerId === me.playerId) mine += b.amount;
      else others += b.amount;
    }
    const result = showingResult ? myLast.find((x) => x.kind === kind) : undefined;
    return { mine, others, result };
  }

  // ---------- The cards ----------

  const hand = last?.hand ?? null;
  const reveal = (who: "player" | "banker", i: number) => {
    if (!hand) return null;
    const card = (who === "player" ? hand.player : hand.banker)[i];
    if (!dealingNow || !tl) return card;
    if (i === 2) return card; // third cards come out face up
    return elapsed >= (who === "player" ? tl.revealPlayerAt : tl.revealBankerAt) ? card : null;
  };
  const visible = (who: "player" | "banker", i: number) => {
    if (!hand) return false;
    const cards = who === "player" ? hand.player : hand.banker;
    if (i >= cards.length) return false;
    if (!dealingNow || !tl) return true;
    return elapsed >= (tl.dealAt.get(who === "player" ? playerSlot(i) : bankerSlot(i)) ?? 0) || i < 2;
  };
  const totalShown = (who: "player" | "banker") => {
    if (!hand) return null;
    const cards = (who === "player" ? hand.player : hand.banker).filter((_, i) => visible(who, i) && reveal(who, i));
    return cards.length >= 2 ? handTotal(cards) : null;
  };

  const srSummary = !hand
    ? "Place your bets."
    : dealingNow
      ? "Dealing."
      : `${describeHand(hand)}. Player: ${hand.player.map(cardLabel).join(", ")}. Banker: ${hand.banker.map(cardLabel).join(", ")}.${
          myLast.length ? (myNet > 0 ? ` You won ${formatChips(myNet)}.` : myNet < 0 ? ` You lost ${formatChips(-myNet)}.` : " Your bets pushed.") : ""
        }`;

  const chips = DENOMINATIONS.filter((d) => d.value <= table.maxBet && d.value <= Math.max(me.chips, table.minBet)).slice(0, 7);

  if (table.status === "closed") {
    return (
      <div className="pixel-panel mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <h1 className="font-display text-base text-starlight">{table.name}</h1>
        <p className="text-starlight/70">This table was closed by its host.</p>
        <button type="button" onClick={() => router.push("/baccarat")} className="pixel-btn bg-neon-cyan text-ink">
          Find another table
        </button>
      </div>
    );
  }

  // A plain function (not a component) so the cards keep their place between renders.
  const handBox = (who: "player" | "banker") => {
    const c = COLORS[who];
    const total = totalShown(who);
    const winner = hand && !dealingNow && hand.winner === who;
    return (
      <div
        className={`flex flex-1 flex-col items-center gap-2 rounded-lg border-2 p-3 ${c.border} ${winner ? "bg-white/10 shadow-[0_0_18px_currentColor]" : ""} ${c.text}`}
      >
        <p className="flex items-center gap-2 font-display text-xs">
          {who === "player" ? "Player" : "Banker"}
          {total !== null && <span className="rounded bg-ink/60 px-1.5 py-0.5 text-starlight">{total}</span>}
        </p>
        <div className="flex min-h-20 gap-1.5 sm:min-h-28">
          {hand &&
            [0, 1, 2].map((i) =>
              visible(who, i) ? (
                <DealtCard
                  key={`${last!.n}-${who}-${i}`}
                  slot={who === "player" ? playerSlot(i) : bankerSlot(i)}
                  card={reveal(who, i)}
                />
              ) : null,
            )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Table info */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="font-display text-base text-starlight sm:text-lg">{table.name}</h1>
            <GuideLink game="baccarat" />
          </div>
          <p className="text-sm text-starlight/70">
            <span className="font-display text-[0.6rem] text-neon-lime">{baccaratSummary(r)}</span>
            {" · "}Bets {formatChips(table.minBet)}–{formatChips(table.maxBet)}
          </p>
        </div>
        <p className="flex items-baseline gap-2">
          <span className="text-sm text-starlight/70">Balance</span>
          <span className="font-display text-base text-neon-gold">
            <TickingNumber value={shownChips} />
          </span>
        </p>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {srSummary}
      </p>

      {/* The cards */}
      <DealContext value={{ shoeRef, discardRef, trayRef, plan: dealing?.plan ?? EMPTY_PLAN, settlement: null }}>
        <section aria-label="Baccarat table" className="craps-felt relative flex flex-col gap-3 p-4 pt-14 sm:p-6 sm:pt-6">
          <Shoe cardsLeft={state.cardsLeft} className="top-3 right-3 sm:top-5 sm:right-5" />
          <p className="text-center font-display text-xs text-neon-gold sm:text-sm" aria-hidden>
            {!hand ? "Place your bets" : dealingNow ? "Dealing…" : describeHand(hand)}
            {last?.newShoe && !dealingNow && <span className="ml-2 text-starlight/60">· new shoe</span>}
          </p>
          {showingResult && myLast.length > 0 && (
            <p className={`text-center font-display text-xs ${myNet > 0 ? "text-neon-cyan" : myNet < 0 ? "text-neon-magenta" : "text-starlight/70"}`}>
              {myNet > 0 ? `+${formatChips(myNet)} this hand` : myNet < 0 ? `−${formatChips(-myNet)} this hand` : "Your bets pushed"}
            </p>
          )}
          <div className="flex gap-3 sm:gap-6 sm:pr-24">
            {handBox("player")}
            {handBox("banker")}
          </div>
        </section>
      </DealContext>

      {error && (
        <p role="alert" className="text-center text-sm text-neon-magenta">
          {error}
        </p>
      )}

      {/* Bets */}
      <section aria-label="Bets" className="craps-felt flex flex-col gap-3 p-3 sm:p-4">
        <div className="grid grid-cols-3 gap-2">
          {spots.map((s) => {
            const { mine, others, result } = onSpot(s.kind);
            const c = COLORS[s.color!];
            return (
              <button
                key={s.kind}
                type="button"
                onClick={() => bet(s.kind)}
                disabled={!seated || dealingNow}
                aria-label={`${s.label}, pays ${s.pays}${mine ? `, your bet ${formatChips(mine)}` : ""}`}
                className={`craps-spot min-h-24 ${c.border} ${result?.outcome === "win" ? "craps-spot-won" : ""}`}
              >
                <span className={`font-display text-xs sm:text-sm ${c.text}`}>{s.label}</span>
                <span className="text-[0.65rem] text-starlight/60">{s.pays}</span>
                {(mine > 0 || others > 0) && (
                  <span className="flex items-end gap-1">
                    {mine > 0 && <ChipStack amount={mine} size="sm" />}
                    {others > 0 && <span className="rounded bg-ink/60 px-1 text-[0.55rem] text-starlight/70">+{formatChips(others)}</span>}
                  </span>
                )}
                {result && (
                  <span className={`text-[0.65rem] ${result.outcome === "win" ? "text-neon-cyan" : result.outcome === "lose" ? "text-neon-magenta" : "text-starlight/70"}`}>
                    {result.outcome === "win" ? `+${formatChips(result.winnings)}` : result.outcome === "lose" ? `−${formatChips(result.amount)}` : "push"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {sides.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
            {sides.map((s) => {
              const { mine, others, result } = onSpot(s.kind);
              return (
                <button
                  key={s.kind}
                  type="button"
                  onClick={() => bet(s.kind)}
                  disabled={!seated || dealingNow}
                  aria-label={`${s.label}, pays ${s.pays}${mine ? `, your bet ${formatChips(mine)}` : ""}`}
                  className={`craps-spot ${result?.outcome === "win" ? "craps-spot-won" : ""}`}
                >
                  <span className="font-display text-[0.55rem] sm:text-[0.6rem]">{s.label}</span>
                  <span className="text-[0.6rem] text-starlight/60">{s.pays}</span>
                  {(mine > 0 || others > 0) && (
                    <span className="flex items-end gap-1">
                      {mine > 0 && <ChipStack amount={mine} size="sm" />}
                      {others > 0 && <span className="rounded bg-ink/60 px-1 text-[0.55rem] text-starlight/70">+{formatChips(others)}</span>}
                    </span>
                  )}
                  {result && (
                    <span className={`text-[0.6rem] ${result.outcome === "win" ? "text-neon-cyan" : result.outcome === "lose" ? "text-neon-magenta" : "text-starlight/70"}`}>
                      {result.outcome === "win" ? `+${formatChips(result.winnings)}` : result.outcome === "lose" ? `−${formatChips(result.amount)}` : "push"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Chips and controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Chip to bet with</legend>
          {chips.map((d) => (
            <label
              key={d.value}
              className="cursor-pointer rounded-full p-0.5 has-checked:outline-3 has-checked:outline-neon-gold has-focus-visible:outline-3 has-focus-visible:outline-neon-cyan"
              title={`${d.name} · ${formatChips(d.value)}`}
            >
              <input type="radio" name="chip" value={d.value} checked={chip === d.value} onChange={() => setChip(d.value)} className="sr-only" />
              <span className="sr-only">{formatChips(d.value)} chip</span>
              <Chip denomination={d} size="md" />
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          {seated && myBets.length === 0 && myLast.length > 0 && !dealingNow && (
            <button type="button" disabled={pending} onClick={() => apply(baccaratRebetAction(tableId))} className="pixel-btn bg-space-800 text-neon-cyan">
              Rebet
            </button>
          )}
          {myBets.length > 0 && !dealingNow && (
            <button type="button" disabled={pending} onClick={() => apply(baccaratClearAction(tableId))} className="pixel-btn bg-space-800 text-starlight">
              Clear bets
            </button>
          )}
          {seated && (
            <button type="button" onClick={deal} disabled={!canDeal} className="pixel-btn bg-neon-lime text-ink disabled:opacity-60">
              {dealingNow
                ? "Dealing…"
                : iAmReady
                  ? "Waiting for others"
                  : secondsToNext > 0
                    ? `Next hand in ${secondsToNext}s`
                    : myBets.length === 0
                      ? "Bet to deal"
                      : "Deal"}
              <kbd className="kbd" aria-hidden>
                D
              </kbd>
            </button>
          )}
        </div>
      </div>
      {othersSeated && secondsToDeal !== null && !dealingNow && (
        <p className="text-center text-sm text-starlight/70" role="status">
          Cards out in {secondsToDeal}s{iAmReady ? " — you're ready" : " — press Deal when you're ready"}
        </p>
      )}

      <Roads history={state.history} />

      {/* Seats */}
      <section aria-label="Players" className="pixel-panel flex flex-col gap-4 p-4 sm:p-5">
        <ul className="flex flex-wrap gap-3">
          {Array.from({ length: table.seats }, (_, seatNumber) => {
            const s = seats.find((x) => x.seatNumber === seatNumber);
            if (!s) {
              return (
                <li key={seatNumber}>
                  <button
                    type="button"
                    disabled={seated || pending}
                    onClick={() => apply(baccaratSitAction(tableId, seatNumber))}
                    aria-label={`Sit in seat ${seatNumber + 1}`}
                    className="flex h-full min-h-14 min-w-24 items-center justify-center rounded-md border-2 border-dashed border-space-700 px-3 text-sm text-starlight/70 enabled:hover:border-neon-cyan enabled:hover:text-neon-cyan disabled:opacity-50"
                  >
                    {seated ? "Open seat" : "Sit"}
                  </button>
                </li>
              );
            }
            const theirs = state.bets.filter((b) => b.playerId === s.playerId).reduce((t, b) => t + b.amount, 0);
            const ready = state.ready.includes(s.playerId);
            return (
              <li key={seatNumber} className="flex min-w-28 items-center gap-2 rounded-md border-2 border-space-700 px-3 py-2">
                <Avatar avatar={s.avatar} size={28} />
                <span className="flex flex-col">
                  <span className="max-w-28 truncate text-sm">{s.playerId === me.playerId ? "You" : s.username}</span>
                  <span className="text-xs text-starlight/60">
                    {theirs > 0 ? `${formatChips(theirs)} bet${ready ? " · ready" : ""}` : "No bet yet"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-3">
          {seated && (
            <button type="button" disabled={pending} onClick={() => apply(baccaratLeaveAction(tableId))} className="pixel-btn bg-space-800 text-starlight">
              Leave table
            </button>
          )}
          {table.inviteCode && (
            <button type="button" onClick={copyInvite} className="pixel-btn bg-space-800 text-neon-cyan">
              {copied ? "Copied!" : "Copy invite link"}
            </button>
          )}
          {me.isOwner &&
            (confirmClose ? (
              <span className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await closeBaccaratTableAction(tableId);
                      if (result.ok) router.push("/baccarat");
                      else setError(result.error ?? "Couldn't close the table.");
                    })
                  }
                  className="pixel-btn bg-neon-magenta text-ink"
                >
                  Yes, close it (all bets are returned)
                </button>
                <button type="button" onClick={() => setConfirmClose(false)} className="pixel-btn bg-space-800 text-starlight">
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmClose(true)} className="pixel-btn bg-space-800 text-neon-magenta">
                Close table
              </button>
            ))}
        </div>
        {!seated && <p className="text-sm text-starlight/70">You&apos;re watching. Take a seat to bet.</p>}
      </section>
    </div>
  );
}
