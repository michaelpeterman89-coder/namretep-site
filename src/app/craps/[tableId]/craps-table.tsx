"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { Chip, ChipStack, DENOMINATIONS } from "@/components/chip";
import { prefersReducedMotion } from "@/components/card-table/dealing";
import { TickingNumber } from "@/components/ticking-number";
import { formatChips } from "@/lib/chips";
import {
  betName,
  callRoll,
  cantRemove,
  COME_OUT_TOGGLE,
  crapsSummary,
  FIRE_PAYS,
  HARDWAY_PAYS,
  maxLayOddsWin,
  maxOddsMultiple,
  PLACE_PAYS,
  pointNumbers,
  PROP_PAYS,
  SHOOTER_TIMEOUT_MS,
  TRUE_ODDS,
  type Bet,
  type BetKind,
  type BetRequest,
  type Dice,
} from "@/lib/games/craps";
import { playSound } from "@/lib/sound";
import { createClient } from "@/lib/supabase/client";
import type { CrapsView } from "@/server/craps";
import {
  closeCrapsTableAction,
  crapsBetAction,
  crapsClearAction,
  crapsComeOutAction,
  crapsLeaveAction,
  crapsRemoveAction,
  crapsRollAction,
  crapsSitAction,
  type CrapsResult,
} from "../actions";

async function loadTable(tableId: string, method: "GET" | "POST"): Promise<CrapsView | null> {
  try {
    const res = await fetch(`/api/craps/${tableId}`, { method, cache: "no-store" });
    const body = (await res.json()) as { view: CrapsView | null };
    return body.view;
  } catch {
    return null;
  }
}

const TUMBLE_MS = 900;
const ratio = ([w, p]: readonly [number, number]) => `${w}:${p}`;
/** Split prop bets: one chip on each part. */
const PARTS: Partial<Record<BetKind, number>> = { horn: 4, ce: 2, world: 5 };
const HOPS: Dice[] = [];
for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) HOPS.push([a, b]);

// ---------- Small pieces ----------

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ value, size = "3rem", tumbling = false, delay = 0 }: { value: number; size?: string; tumbling?: boolean; delay?: number }) {
  return (
    <span
      aria-hidden
      className={`die ${tumbling ? "die-tumble" : ""}`}
      style={{ "--die-size": size, animationDelay: `${delay}ms` } as React.CSSProperties}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={PIPS[value]?.includes(i) ? "pip" : ""} />
      ))}
    </span>
  );
}

/** A betting area on the felt: shows the payout, your chips, and everyone else's. */
function Spot({
  label,
  pays,
  mine,
  others,
  won,
  disabled,
  title,
  onClick,
  className = "",
  children,
}: {
  label: React.ReactNode;
  pays?: string;
  mine: number;
  others: number;
  won: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const aria = `${title}${pays ? `, pays ${pays}` : ""}${mine ? `, your bet ${formatChips(mine)}` : ""}${disabled ? " (not available now)" : ""}`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      title={disabled ? title : undefined}
      className={`craps-spot ${won ? "craps-spot-won" : ""} ${className}`}
    >
      <span className="font-display text-[0.6rem] leading-tight sm:text-[0.7rem]">{label}</span>
      {pays && <span className="text-[0.65rem] text-starlight/60">{pays}</span>}
      {children}
      {(mine > 0 || others > 0) && (
        <span className="flex items-end gap-1">
          {mine > 0 && <ChipStack amount={mine} size="sm" />}
          {others > 0 && (
            <span className="rounded bg-ink/60 px-1 text-[0.55rem] text-starlight/70">+{formatChips(others)}</span>
          )}
        </span>
      )}
    </button>
  );
}

/** Small pips showing progress toward a bonus bet. */
function Progress({ numbers, hit }: { numbers: number[]; hit: number[] }) {
  return (
    <span className="flex flex-wrap justify-center gap-0.5">
      {numbers.map((n) => (
        <span
          key={n}
          className={`rounded px-1 text-[0.55rem] ${hit.includes(n) ? "bg-neon-gold text-ink" : "bg-ink/50 text-starlight/50"}`}
        >
          {n}
        </span>
      ))}
    </span>
  );
}

// ---------- The table ----------

export function CrapsTableView({ initialView }: { initialView: CrapsView }) {
  const router = useRouter();
  const tableId = initialView.table.id;
  const [view, setView] = useState(initialView);
  const [offset, setOffset] = useState(() => new Date(initialView.serverNow).getTime() - Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [tumbling, setTumbling] = useState(false);
  const [wonKeys, setWonKeys] = useState<{ n: number; keys: Set<string> }>({ n: 0, keys: new Set() });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [chip, setChip] = useState(() => Math.max(initialView.table.minBet, 1));
  const [numberMode, setNumberMode] = useState<"place" | "buy" | "lay">("place");
  const [confirmClose, setConfirmClose] = useState(false);
  const [copied, setCopied] = useState(false);
  const latestAt = useRef(initialView.serverNow);
  const latestView = useRef(initialView);
  const shownRoll = useRef(initialView.game.lastRoll?.n ?? 0);
  const tumblingRef = useRef(false);
  const headerChips = useRef(initialView.me.chips);

  /** Shows a roll's result: sounds, and a glow on every bet that won. */
  const reveal = useCallback((next: CrapsView) => {
    const last = next.game.lastRoll;
    if (!last) return;
    const me = next.me.playerId;
    const mine = last.results.filter((r) => r.playerId === me);
    const net = mine.reduce((s, r) => s + (r.outcome === "win" ? r.winnings : r.outcome === "lose" ? -r.amount : 0), 0);
    if (net > 0) playSound("win");
    else if (net < 0) playSound("lose");
    const keys = new Set(last.results.filter((r) => r.outcome === "win").map((r) => `${r.kind}:${r.number ?? ""}`));
    setWonKeys({ n: last.n, keys });
  }, []);

  // The dice tumble from the moment the shooter clicks (or a new roll arrives)
  // until the result is in and at least TUMBLE_MS has passed. While they
  // tumble they show random faces, never the previous roll.
  const tumbleStart = useRef(0);
  const landing = useRef(false);

  const startTumble = useCallback(() => {
    if (tumblingRef.current) return;
    tumblingRef.current = true;
    landing.current = false;
    tumbleStart.current = Date.now();
    setTumbling(true);
    playSound("deal");
  }, []);

  /** Lands the dice on the newest result (or, if `withResult` is false, just stops them). */
  const land = useCallback(
    (withResult: boolean) => {
      if (!tumblingRef.current || landing.current) return;
      landing.current = true;
      const wait = withResult ? Math.max(0, TUMBLE_MS - (Date.now() - tumbleStart.current)) : 0;
      setTimeout(() => {
        tumblingRef.current = false;
        landing.current = false;
        setTumbling(false);
        const latest = latestView.current;
        shownRoll.current = Math.max(shownRoll.current, latest.game.lastRoll?.n ?? 0);
        setView(latest);
        if (withResult) reveal(latest);
      }, wait);
    },
    [reveal],
  );

  const accept = useCallback(
    (next: CrapsView | null) => {
      if (!next || next.serverNow < latestAt.current) return;
      latestAt.current = next.serverNow;
      latestView.current = next;
      setOffset(new Date(next.serverNow).getTime() - Date.now());
      const n = next.game.lastRoll?.n ?? 0;
      if (n > shownRoll.current) {
        shownRoll.current = n;
        if (prefersReducedMotion() && !tumblingRef.current) {
          setView(next);
          reveal(next);
          return;
        }
        startTumble();
        land(true);
        return;
      }
      if (tumblingRef.current) return; // shown when the dice land
      setView(next);
    },
    [reveal, startTumble, land],
  );

  // Random faces while the dice are in the air.
  const [faces, setFaces] = useState<[number, number]>([1, 1]);
  useEffect(() => {
    if (!tumbling) return;
    const spin = () => setFaces([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    spin();
    const timer = setInterval(spin, 90);
    return () => clearInterval(timer);
  }, [tumbling]);

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
        .channel(`craps-${tableId}`)
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
  const rollAt = game.rollAt ? new Date(game.rollAt).getTime() : null;
  const serverNow = now + offset;
  const secondsToRoll = rollAt ? Math.max(0, Math.ceil((rollAt - serverNow) / 1000)) : 0;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  // If the shooter keeps everyone waiting, ask the server to pass the dice.
  const passAt = rollAt && seats.length > 1 ? rollAt + SHOOTER_TIMEOUT_MS : null;
  const lastTick = useRef(0);
  useEffect(() => {
    if (!passAt || serverNow < passAt || Date.now() - lastTick.current < 3000) return;
    lastTick.current = Date.now();
    void loadTable(tableId, "POST").then(accept);
  }, [passAt, serverNow, tableId, accept]);

  // The header's chip count follows bets and payouts.
  useEffect(() => {
    if (view.me.chips !== headerChips.current) {
      headerChips.current = view.me.chips;
      router.refresh();
    }
  }, [view.me.chips, router]);

  // ---------- Who's who ----------

  const seated = me.seatNumber !== null;
  const shooter = seats.find((s) => s.playerId === game.shooterId) ?? null;
  const iShoot = game.shooterId === me.playerId;
  const canRoll = iShoot && !tumbling && !pending && secondsToRoll === 0;
  const myBets = state.bets.filter((b) => b.playerId === me.playerId);
  const onTable = myBets.reduce((s, b) => s + b.amount, 0);
  const point = state.point;
  const crapless = table.rules.variant === "crapless";
  const numbers = pointNumbers(table.rules.variant);
  const won = (key: string) => wonKeys.keys.has(key);

  const sum = useCallback(
    (match: (b: Bet) => boolean) => {
      let mine = 0;
      let others = 0;
      for (const b of state.bets) {
        if (!match(b)) continue;
        if (b.playerId === me.playerId) mine += b.amount;
        else others += b.amount;
      }
      return { mine, others };
    },
    [state.bets, me.playerId],
  );

  // ---------- Actions ----------

  function apply(request: Promise<CrapsResult>) {
    startTransition(async () => {
      const result = await request;
      accept(result.view);
      setError(result.ok ? null : (result.error ?? "Something went wrong."));
    });
  }

  function bet(request: Omit<BetRequest, "amount">, amount = chip) {
    if (!seated) {
      setError("Take a seat to bet.");
      return;
    }
    playSound("chip");
    apply(crapsBetAction(tableId, { ...request, amount: amount * (PARTS[request.kind] ?? 1) }));
  }

  function roll() {
    if (!canRoll) return;
    // Start the dice moving right away; they land when the result arrives.
    if (!prefersReducedMotion()) startTumble();
    startTransition(async () => {
      const result = await crapsRollAction(tableId);
      accept(result.view);
      setError(result.ok ? null : (result.error ?? "Something went wrong."));
      if (!result.ok) land(false);
    });
  }

  /** The most odds this bet can still take. */
  function oddsRoom(parent: Bet): number {
    const existing = state.bets.find((b) => b.parentId === parent.id)?.amount ?? 0;
    if (parent.number === null) return 0;
    if (parent.kind === "pass" || parent.kind === "come") {
      return maxOddsMultiple(table.rules, parent.number) * parent.amount - existing;
    }
    const [w, p] = TRUE_ODDS[parent.number];
    // Largest lay whose win stays within the limit.
    return Math.floor((maxLayOddsWin(table.rules, parent.number, parent.amount) * w) / p) - existing;
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

  // ---------- Keyboard: R or Space rolls ----------

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Space on a focused button presses that button, as usual.
      if (e.key === " " && tag === "BUTTON") return;
      if ((e.key === "r" || e.key === "R" || e.key === " ") && canRoll) {
        e.preventDefault();
        roll();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------- What the last roll did for me ----------

  const last = game.lastRoll;
  const myResults = useMemo(
    () => (last && !tumbling ? last.results.filter((r) => r.playerId === me.playerId && r.outcome !== "moved") : []),
    [last, tumbling, me.playerId],
  );
  const myNet = myResults.reduce((s, r) => s + (r.outcome === "win" ? r.winnings : r.outcome === "lose" ? -r.amount : 0), 0);
  const call = last ? callRoll(last.event, last.dice, last.point) : null;

  const chips = DENOMINATIONS.filter((d) => d.value <= table.maxBet && d.value <= Math.max(me.chips, table.minBet)).slice(0, 7);

  if (table.status === "closed") {
    return (
      <div className="pixel-panel mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <h1 className="font-display text-base text-starlight">{table.name}</h1>
        <p className="text-starlight/70">This table was closed by its host.</p>
        <button type="button" onClick={() => router.push("/craps")} className="pixel-btn bg-neon-cyan text-ink">
          Find another table
        </button>
      </div>
    );
  }

  const numberPays = (n: number) =>
    numberMode === "place"
      ? ratio(PLACE_PAYS[n])
      : numberMode === "buy"
        ? `${ratio(TRUE_ODDS[n])} −5%`
        : `${TRUE_ODDS[n][1]}:${TRUE_ODDS[n][0]} −5%`;

  const passBet = myBets.find((b) => b.kind === "pass");
  const dontBet = myBets.find((b) => b.kind === "dontPass");

  return (
    <div className="flex flex-col gap-5">
      {/* Table info */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-display text-base text-starlight sm:text-lg">{table.name}</h1>
          <p className="text-sm text-starlight/70">
            <span className="font-display text-[0.6rem] text-neon-magenta">{crapsSummary(table.rules)}</span>
            {" · "}Bets {formatChips(table.minBet)}–{formatChips(table.maxBet)}
          </p>
        </div>
        <div className="flex items-baseline gap-4">
          {onTable > 0 && (
            <p className="flex items-baseline gap-2">
              <span className="text-sm text-starlight/70">On the table</span>
              <span className="font-display text-xs text-starlight">{formatChips(onTable)}</span>
            </p>
          )}
          <p className="flex items-baseline gap-2">
            <span className="text-sm text-starlight/70">Balance</span>
            <span className="font-display text-base text-neon-gold">
              <TickingNumber value={me.chips} />
            </span>
          </p>
        </div>
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {tumbling
          ? "Rolling."
          : last
            ? `${last.dice[0]} and ${last.dice[1]}: ${call}. ${myNet > 0 ? `You won ${formatChips(myNet)}.` : myNet < 0 ? `You lost ${formatChips(-myNet)}.` : ""} ${point ? `The point is ${point}.` : "Come-out roll next."}`
            : "Waiting for the first roll."}
      </p>

      {/* Dice and the shooter */}
      <section aria-label="Dice" className="pixel-panel flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            {tumbling ? (
              <>
                <Die value={faces[0]} size="3.25rem" tumbling />
                <Die value={faces[1]} size="3.25rem" tumbling delay={60} />
              </>
            ) : last ? (
              <>
                <Die value={last.dice[0]} size="3.25rem" />
                <Die value={last.dice[1]} size="3.25rem" />
              </>
            ) : (
              <>
                <Die value={6} size="3.25rem" />
                <Die value={5} size="3.25rem" />
              </>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-display text-xs text-neon-gold sm:text-sm">{tumbling ? "Rolling…" : (call ?? "Place your bets")}</p>
            {!tumbling && myNet !== 0 && (
              <p className={`font-display text-xs ${myNet > 0 ? "text-neon-cyan" : "text-neon-magenta"}`}>
                {myNet > 0 ? "+" : "−"}
                {formatChips(Math.abs(myNet))} this roll
              </p>
            )}
            <p className="text-sm text-starlight/70">
              {point ? (
                <>
                  Point is <span className="text-neon-gold">{point}</span>
                </>
              ) : (
                "Come-out roll"
              )}
              {shooter && (
                <>
                  {" · "}
                  {iShoot ? "You have the dice" : `${shooter.username} is shooting`}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {iShoot ? (
            <button
              type="button"
              onClick={roll}
              disabled={!canRoll}
              className="pixel-btn bg-neon-magenta text-ink disabled:opacity-60"
            >
              {secondsToRoll > 0 ? `Roll in ${secondsToRoll}s` : "Roll the dice"}
              <kbd className="kbd" aria-hidden>
                R
              </kbd>
            </button>
          ) : (
            <p className="text-sm text-starlight/70">
              {shooter
                ? secondsToRoll > 0
                  ? `Bets close in ${secondsToRoll}s`
                  : `Waiting for ${shooter.username} to roll`
                : "Waiting for a shooter"}
            </p>
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="text-center text-sm text-neon-magenta">
          {error}
        </p>
      )}

      {/* Chips */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Chip to bet with</legend>
          {chips.map((d) => (
            <label
              key={d.value}
              className="cursor-pointer rounded-full p-0.5 has-checked:outline-3 has-checked:outline-neon-gold has-focus-visible:outline-3 has-focus-visible:outline-neon-cyan"
              title={`${d.name} · ${formatChips(d.value)}`}
            >
              <input
                type="radio"
                name="chip"
                value={d.value}
                checked={chip === d.value}
                onChange={() => setChip(d.value)}
                className="sr-only"
              />
              <span className="sr-only">{formatChips(d.value)} chip</span>
              <Chip denomination={d} size="md" />
            </label>
          ))}
        </fieldset>
        {myBets.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => apply(crapsClearAction(tableId))}
            className="pixel-btn bg-space-800 text-starlight"
          >
            Take down bets
          </button>
        )}
      </div>

      {/* The layout */}
      <div className="grid gap-5 lg:grid-cols-[1fr_19rem] lg:items-start">
        <section aria-label="Craps layout" className="craps-felt flex flex-col gap-2 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-display text-[0.55rem] text-starlight/70">Number bets</span>
            <div role="radiogroup" aria-label="Number bet type" className="flex gap-1">
              {(["place", "buy", "lay"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={numberMode === m}
                  onClick={() => setNumberMode(m)}
                  className={`rounded border-2 px-2 py-0.5 font-display text-[0.55rem] ${
                    numberMode === m ? "border-neon-gold text-neon-gold" : "border-space-700 text-starlight/70"
                  }`}
                >
                  {m === "place" ? "Place" : m === "buy" ? "Buy" : "Lay"}
                </button>
              ))}
            </div>
          </div>
          <div className={`grid gap-1.5 ${crapless ? "grid-cols-5" : "grid-cols-3 sm:grid-cols-6"}`}>
            {numbers.map((n) => {
              const numberBets = sum((b) => b.number === n && (b.kind === numberMode));
              const comes = sum((b) => (b.kind === "come" || b.kind === "dontCome") && b.number === n);
              return (
                <Spot
                  key={n}
                  label={<span className="text-base sm:text-lg">{n}</span>}
                  pays={numberPays(n)}
                  mine={numberBets.mine}
                  others={numberBets.others}
                  won={won(`${numberMode}:${n}`) || won(`come:${n}`)}
                  title={`${numberMode === "place" ? "Place" : numberMode === "buy" ? "Buy" : "Lay"} ${n}`}
                  onClick={() => bet({ kind: numberMode, number: n })}
                >
                  {point === n && <span className="craps-puck">ON</span>}
                  {comes.mine > 0 && (
                    <span className="rounded bg-neon-cyan/20 px-1 text-[0.55rem] text-neon-cyan">Come {formatChips(comes.mine)}</span>
                  )}
                </Spot>
              );
            })}
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-1.5">
            <Spot
              label="Come"
              pays="1:1"
              {...sum((b) => b.kind === "come" && b.number === null)}
              won={won("come:")}
              disabled={point === null}
              title="Come (after a point is set)"
              onClick={() => bet({ kind: "come" })}
              className="min-h-[3.75rem]"
            />
            {!crapless && (
              <Spot
                label={<>Don&apos;t Come</>}
                pays="Bar 12"
                {...sum((b) => b.kind === "dontCome" && b.number === null)}
                won={won("dontCome:")}
                disabled={point === null}
                title="Don't Come (after a point is set)"
                onClick={() => bet({ kind: "dontCome" })}
                className="px-3"
              />
            )}
          </div>

          <Spot
            label="Field · 2 · 3 · 4 · 9 · 10 · 11 · 12"
            pays={`2 pays 2:1 · 12 pays ${table.rules.field12}:1 · others 1:1`}
            {...sum((b) => b.kind === "field")}
            won={won("field:")}
            title="Field"
            onClick={() => bet({ kind: "field" })}
          />

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {!crapless && (
              <Spot
                label={<>Don&apos;t Pass</>}
                pays="Bar 12"
                {...sum((b) => b.kind === "dontPass")}
                won={won("dontPass:")}
                disabled={point !== null}
                title="Don't Pass (come-out only)"
                onClick={() => bet({ kind: "dontPass" })}
              />
            )}
            <Spot label="Big 6" pays="1:1" {...sum((b) => b.kind === "big6")} won={won("big6:")} title="Big 6" onClick={() => bet({ kind: "big6" })} />
            <Spot label="Big 8" pays="1:1" {...sum((b) => b.kind === "big8")} won={won("big8:")} title="Big 8" onClick={() => bet({ kind: "big8" })} />
            {passBet && passBet.number !== null ? (
              <Spot
                label="Pass odds"
                pays={ratio(TRUE_ODDS[passBet.number])}
                {...sum((b) => b.parentId === passBet.id)}
                won={won(`odds:${passBet.number}`)}
                disabled={oddsRoom(passBet) <= 0}
                title="Odds behind your Pass Line bet"
                onClick={() => bet({ kind: "odds", parentId: passBet.id }, Math.min(chip, oddsRoom(passBet)))}
              />
            ) : dontBet && dontBet.number !== null ? (
              <Spot
                label="Lay odds"
                pays={`${TRUE_ODDS[dontBet.number][1]}:${TRUE_ODDS[dontBet.number][0]}`}
                {...sum((b) => b.parentId === dontBet.id)}
                won={won(`layOdds:${dontBet.number}`)}
                disabled={oddsRoom(dontBet) <= 0}
                title="Lay odds behind your Don't Pass bet"
                onClick={() => bet({ kind: "layOdds", parentId: dontBet.id }, Math.min(chip, oddsRoom(dontBet)))}
              />
            ) : null}
          </div>

          <Spot
            label="Pass Line"
            pays="1:1"
            {...sum((b) => b.kind === "pass")}
            won={won("pass:")}
            disabled={point !== null}
            title="Pass Line (come-out only)"
            onClick={() => bet({ kind: "pass" })}
            className="min-h-[3.75rem]"
          />
        </section>

        {/* Props and bonus bets */}
        <section aria-label="Proposition and bonus bets" className="craps-felt flex flex-col gap-3 p-3 sm:p-4">
          {table.rules.props && (
            <>
              <span className="font-display text-[0.55rem] text-starlight/70">Hardways</span>
              <div className="grid grid-cols-4 gap-1.5">
                {[4, 6, 8, 10].map((n) => (
                  <Spot
                    key={n}
                    label={
                      <span className="flex gap-0.5">
                        <Die value={n / 2} size="1.2rem" />
                        <Die value={n / 2} size="1.2rem" />
                      </span>
                    }
                    pays={ratio(HARDWAY_PAYS[n])}
                    {...sum((b) => b.kind === "hard" && b.number === n)}
                    won={won(`hard:${n}`)}
                    title={`Hard ${n}`}
                    onClick={() => bet({ kind: "hard", number: n })}
                  />
                ))}
              </div>
              <span className="font-display text-[0.55rem] text-starlight/70">One roll</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ["any7", "Any 7", ratio(PROP_PAYS.any7)],
                    ["anyCraps", "Any Craps", ratio(PROP_PAYS.anyCraps)],
                    ["two", "2", ratio(PROP_PAYS.two)],
                    ["three", "3", ratio(PROP_PAYS.three)],
                    ["yo", "11", ratio(PROP_PAYS.yo)],
                    ["twelve", "12", ratio(PROP_PAYS.twelve)],
                    ["horn", "Horn", "4 chips"],
                    ["ce", "C & E", "2 chips"],
                    ["world", "World", "5 chips"],
                  ] as [BetKind, string, string][]
                ).map(([kind, label, pays]) => (
                  <Spot
                    key={kind}
                    label={label}
                    pays={pays}
                    {...sum((b) => b.kind === kind)}
                    won={won(`${kind}:`)}
                    title={betName(kind, null)}
                    onClick={() => bet({ kind })}
                  />
                ))}
              </div>
            </>
          )}

          {table.rules.hops && (
            <details className="group">
              <summary className="cursor-pointer font-display text-[0.55rem] text-starlight/70">
                Hop bets · 15:1, doubles 30:1
              </summary>
              <div className="mt-2 grid grid-cols-4 gap-1 sm:grid-cols-7 lg:grid-cols-4">
                {HOPS.map((d) => {
                  const key = `${d[0]}-${d[1]}`;
                  const amounts = sum((b) => b.kind === "hop" && b.dice?.[0] === d[0] && b.dice?.[1] === d[1]);
                  return (
                    <Spot
                      key={key}
                      label={
                        <span className="flex gap-0.5">
                          <Die value={d[0]} size="1.1rem" />
                          <Die value={d[1]} size="1.1rem" />
                        </span>
                      }
                      {...amounts}
                      won={false}
                      title={`Hop ${key}, pays ${d[0] === d[1] ? "30:1" : "15:1"}`}
                      onClick={() => bet({ kind: "hop", dice: d })}
                      className="min-h-0 py-1"
                    />
                  );
                })}
              </div>
            </details>
          )}

          {(table.rules.fireBet || table.rules.allSmallTall) && (
            <span className="font-display text-[0.55rem] text-starlight/70">Bonus bets</span>
          )}
          {table.rules.fireBet && (
            <Spot
              label="Fire Bet"
              pays={`4 pts ${ratio(FIRE_PAYS[4])} · 5 pts ${ratio(FIRE_PAYS[5])} · 6 pts ${ratio(FIRE_PAYS[6])}`}
              {...sum((b) => b.kind === "fire")}
              won={won("fire:")}
              disabled={state.shooterRolls > 0}
              title="Fire Bet (before a new shooter's first roll)"
              onClick={() => bet({ kind: "fire" })}
            >
              <Progress numbers={[4, 5, 6, 8, 9, 10]} hit={state.firePoints} />
            </Spot>
          )}
          {table.rules.allSmallTall && (
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  ["allSmall", "All Small", "34:1", [2, 3, 4, 5, 6]],
                  ["allTall", "All Tall", "34:1", [8, 9, 10, 11, 12]],
                  ["makeEmAll", "Make 'Em All", "175:1", [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]],
                ] as [BetKind, string, string, number[]][]
              ).map(([kind, label, pays, need]) => (
                <Spot
                  key={kind}
                  label={label}
                  pays={pays}
                  {...sum((b) => b.kind === kind)}
                  won={won(`${kind}:`)}
                  disabled={state.smallTallHits.length > 0}
                  title={`${label} (opens after a 7)`}
                  onClick={() => bet({ kind })}
                >
                  <Progress numbers={need} hit={state.smallTallHits} />
                </Spot>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Your bets, in words */}
      {myBets.length > 0 && (
        <section aria-labelledby="my-bets-heading" className="pixel-panel flex flex-col gap-3 p-4 sm:p-5">
          <h2 id="my-bets-heading" className="font-display text-xs text-neon-cyan">
            Your bets
          </h2>
          <ul className="flex flex-col divide-y-2 divide-space-700 text-sm">
            {myBets.map((b) => {
              const parent = b.parentId ? state.bets.find((p) => p.id === b.parentId) : undefined;
              const lineWithPoint = (b.kind === "pass" || b.kind === "come" || b.kind === "dontPass" || b.kind === "dontCome") && b.number !== null;
              const hasOdds = state.bets.some((o) => o.parentId === b.id);
              const toggleable =
                COME_OUT_TOGGLE.includes(b.kind) && (b.kind !== "odds" || parent?.kind === "come");
              const locked = cantRemove(state, b);
              const room = lineWithPoint ? oddsRoom(b) : 0;
              const oddsKind = b.kind === "pass" || b.kind === "come" ? "odds" : "layOdds";
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {betName(b.kind, b.number, b.dice)}
                    {b.kind === "pass" && b.number !== null && <span className="text-starlight/60"> · point {b.number}</span>}
                    {toggleable && point === null && !b.onComeOut && <span className="text-starlight/60"> · off this roll</span>}
                    <span className="ml-2 font-display text-[0.65rem] text-neon-gold">{formatChips(b.amount)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {lineWithPoint && room > 0 && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => bet({ kind: oddsKind, parentId: b.id }, room)}
                        className="rounded border-2 border-neon-cyan px-2 py-0.5 text-xs text-neon-cyan"
                      >
                        {hasOdds ? "Max odds" : "Add max odds"} ({formatChips(room)})
                      </button>
                    )}
                    {toggleable && (
                      <button
                        type="button"
                        disabled={pending}
                        aria-pressed={b.onComeOut}
                        onClick={() => apply(crapsComeOutAction(tableId, b.id, !b.onComeOut))}
                        className="rounded border-2 border-space-700 px-2 py-0.5 text-xs"
                        title="Whether this bet works on the come-out roll"
                      >
                        Come-out: {b.onComeOut ? "On" : "Off"}
                      </button>
                    )}
                    {!b.parentId || !locked ? (
                      <button
                        type="button"
                        disabled={pending || Boolean(locked)}
                        title={locked ?? undefined}
                        onClick={() => apply(crapsRemoveAction(tableId, b.id))}
                        className="rounded border-2 border-space-700 px-2 py-0.5 text-xs disabled:opacity-50"
                      >
                        {locked ? "Stays up" : "Take down"}
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {myResults.length > 0 && (
        <section aria-label="Last roll results" className="flex flex-wrap gap-2 text-xs">
          {myResults.map((r) => (
            <span
              key={r.betId}
              className={`rounded border-2 px-2 py-1 ${
                r.outcome === "win" ? "border-neon-cyan text-neon-cyan" : r.outcome === "lose" ? "border-neon-magenta text-neon-magenta" : "border-space-700"
              }`}
            >
              {betName(r.kind, r.number)}{" "}
              {r.outcome === "win" ? `+${formatChips(r.winnings)}` : r.outcome === "lose" ? `−${formatChips(r.amount)}` : "returned"}
            </span>
          ))}
        </section>
      )}

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
                    onClick={() => apply(crapsSitAction(tableId, seatNumber))}
                    aria-label={`Sit in seat ${seatNumber + 1}`}
                    className="flex h-full min-h-14 min-w-24 items-center justify-center rounded-md border-2 border-dashed border-space-700 px-3 text-sm text-starlight/70 enabled:hover:border-neon-cyan enabled:hover:text-neon-cyan disabled:opacity-50"
                  >
                    {seated ? "Open seat" : "Sit"}
                  </button>
                </li>
              );
            }
            const theirs = state.bets.filter((b) => b.playerId === s.playerId).reduce((t, b) => t + b.amount, 0);
            const shooting = s.playerId === game.shooterId;
            return (
              <li
                key={seatNumber}
                className={`flex min-w-28 items-center gap-2 rounded-md border-2 px-3 py-2 ${
                  shooting ? "border-neon-gold bg-neon-gold/10" : "border-space-700"
                }`}
              >
                <Avatar avatar={s.avatar} size={28} />
                <span className="flex flex-col">
                  <span className="max-w-28 truncate text-sm">
                    {s.playerId === me.playerId ? "You" : s.username}
                  </span>
                  <span className="text-xs text-starlight/60">
                    {shooting ? "🎲 Shooter" : theirs > 0 ? `${formatChips(theirs)} on the table` : "Watching"}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-3">
          {seated && (
            <button type="button" disabled={pending} onClick={() => apply(crapsLeaveAction(tableId))} className="pixel-btn bg-space-800 text-starlight">
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
                      const result = await closeCrapsTableAction(tableId);
                      if (result.ok) router.push("/craps");
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
        {!seated && <p className="text-sm text-starlight/70">You&apos;re watching. Take a seat to bet and shoot.</p>}
        {seated && seats.length > 1 && (
          <p className="text-xs text-starlight/60">
            The dice pass to the next player after a seven-out.
          </p>
        )}
      </section>
    </div>
  );
}
