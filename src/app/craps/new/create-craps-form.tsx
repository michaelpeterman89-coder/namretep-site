"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { formatChips } from "@/lib/chips";
import {
  crapsSummary,
  DEFAULT_CRAPS_RULES,
  ODDS_LIMITS,
  passLineEdge,
  type CrapsRules,
  type OddsLimit,
} from "@/lib/games/craps/rules";
import { createCrapsTableAction, type CreateCrapsTableState } from "../actions";

const STAKES = [
  { label: "1–100", min: 1, max: 100 },
  { label: "5–500", min: 5, max: 500 },
  { label: "25–2,500", min: 25, max: 2_500 },
  { label: "100–10,000", min: 100, max: 10_000 },
];

const BONUS: { key: "props" | "hops" | "fireBet" | "allSmallTall"; label: string; hint: string }[] = [
  { key: "props", label: "Proposition bets & hardways", hint: "Any 7, Any Craps, 2, 3, 11, 12, Horn, C&E, World, hard 4/6/8/10" },
  { key: "hops", label: "Hop bets", hint: "An exact dice combination on the next roll" },
  { key: "fireBet", label: "Fire Bet", hint: "Pays up to 999:1 for making all six points" },
  { key: "allSmallTall", label: "All Small / All Tall / Make 'Em All", hint: "Roll every number before a 7" },
];

/** A row of pill-shaped radio buttons. */
function Choice<T extends string | number>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 font-display text-[0.65rem] text-neon-cyan">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={String(o.value)}
            className="cursor-pointer rounded-md border-2 border-space-700 px-3 py-1.5 text-sm has-checked:border-neon-gold has-checked:text-neon-gold has-focus-visible:outline-3 has-focus-visible:outline-neon-cyan"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CreateCrapsForm() {
  const [state, formAction] = useActionState(createCrapsTableAction, {} as CreateCrapsTableState);
  const [rules, setRules] = useState<CrapsRules>(DEFAULT_CRAPS_RULES);
  const [stakes, setStakes] = useState(1);
  const [seats, setSeats] = useState(6);
  const set = <K extends keyof CrapsRules>(key: K, value: CrapsRules[K]) => setRules((r) => ({ ...r, [key]: value }));
  const { min, max } = STAKES[stakes];

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <input type="hidden" name="minBet" value={min} />
      <input type="hidden" name="maxBet" value={max} />

      <div className="flex flex-col gap-6">
        <section className="pixel-panel flex flex-col gap-5 p-5 sm:p-6">
          <h2 className="font-display text-sm text-neon-gold">Table</h2>
          <Field label="Table name" name="name" required maxLength={40} defaultValue="Space Dice" />
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[0.65rem] text-neon-cyan">Visibility</span>
            <select name="visibility" className="pixel-input" defaultValue="public">
              <option value="public">Public (listed on Tables)</option>
              <option value="private">Private (invite only)</option>
            </select>
          </label>
          <Choice
            legend="Bets (table minimum – maximum)"
            name="stakes"
            value={stakes}
            options={STAKES.map((s, i) => ({ value: i, label: s.label }))}
            onChange={setStakes}
          />
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[0.65rem] text-neon-cyan">Seats: {seats}</span>
            <input
              type="range"
              name="seats"
              min={1}
              max={8}
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
              className="mt-3 accent-neon-magenta"
            />
            <span className="text-sm text-starlight/60">1 for solo play. The dice pass around the table.</span>
          </label>
        </section>

        <section className="pixel-panel flex flex-col gap-5 p-5 sm:p-6">
          <h2 className="font-display text-sm text-neon-gold">Rules</h2>
          <Choice
            legend="Game"
            name="variant"
            value={rules.variant}
            options={[
              { value: "standard", label: "Craps" },
              { value: "crapless", label: "Crapless craps" },
            ]}
            onChange={(v) => set("variant", v)}
          />
          {rules.variant === "crapless" && (
            <p className="text-sm text-starlight/70">
              In crapless craps, 2, 3, 11, and 12 become points instead of winning or losing on the come-out, and there are
              no Don&apos;t bets.
            </p>
          )}
          <Choice
            legend="Odds allowed behind line bets"
            name="odds"
            value={rules.odds}
            options={(Object.keys(ODDS_LIMITS) as OddsLimit[]).map((k) => ({ value: k, label: ODDS_LIMITS[k] }))}
            onChange={(v) => set("odds", v)}
          />
          <Choice
            legend="Field pays on 12"
            name="field12"
            value={rules.field12}
            options={[
              { value: 3, label: "3 to 1" },
              { value: 2, label: "2 to 1" },
            ]}
            onChange={(v) => set("field12", v)}
          />
          <Choice
            legend="Buy & lay commission (5%)"
            name="vig"
            value={rules.vig}
            options={[
              { value: "win", label: "Only on wins" },
              { value: "upfront", label: "Up front" },
            ]}
            onChange={(v) => set("vig", v)}
          />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1.5 font-display text-[0.65rem] text-neon-cyan">Bonus & side bets</legend>
            {BONUS.map((b) => (
              <label key={b.key} className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  name={b.key}
                  checked={rules[b.key]}
                  onChange={(e) => set(b.key, e.target.checked)}
                  className="mt-1 size-4 accent-neon-magenta"
                />
                <span className="flex flex-col">
                  <span>{b.label}</span>
                  <span className="text-sm text-starlight/60">{b.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </section>
      </div>

      <aside className="pixel-panel flex flex-col gap-4 p-5 sm:p-6 lg:sticky lg:top-6">
        <h2 className="font-display text-sm text-neon-gold">Summary</h2>
        <p className="font-display text-[0.6rem] leading-relaxed text-neon-magenta">{crapsSummary(rules)}</p>
        <p className="text-sm text-starlight/80">
          Bets {formatChips(min)}–{formatChips(max)} · {seats} seat{seats === 1 ? "" : "s"}
        </p>
        <p className="text-sm text-starlight/80">
          House edge on the Pass Line: <span className="text-neon-gold">{passLineEdge(rules)}%</span>
          {rules.variant === "crapless" && " (crapless pays for its extra points with a higher edge)"}
        </p>
        <FormMessage error={state.error} />
        <SubmitButton pendingText="Creating…">Create table</SubmitButton>
      </aside>
    </form>
  );
}
