"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { formatChips } from "@/lib/chips";
import {
  baccaratSummary,
  bankerEdge,
  DEFAULT_BACCARAT_RULES,
  VARIANT_NAMES,
  type BaccaratRules,
  type BaccaratVariant,
} from "@/lib/games/baccarat/rules";
import { createBaccaratTableAction, type CreateBaccaratTableState } from "../actions";

const STAKES = [
  { label: "1–100", min: 1, max: 100 },
  { label: "10–1,000", min: 10, max: 1_000 },
  { label: "25–2,500", min: 25, max: 2_500 },
  { label: "100–10,000", min: 100, max: 10_000 },
];

const VARIANT_HINTS: Record<BaccaratVariant, string> = {
  classic: "Banker wins pay 19 to 20 (a 5% commission).",
  super6: "Banker wins pay even money, except a winning Banker 6 pays half.",
  ez: "Banker wins pay even money, but a Banker win with a three-card 7 is a push. Adds Dragon 7 and Panda 8.",
};

const SIDES: { key: "pairs" | "dragonBonus" | "dragon7Panda8" | "bigSmall"; label: string; hint: string; ezOnly?: boolean }[] = [
  { key: "pairs", label: "Pairs", hint: "Player / Banker Pair 11:1, Either Pair 5:1, Perfect Pair 25:1" },
  { key: "dragonBonus", label: "Dragon Bonus", hint: "Pays by how much your side wins by (up to 30:1)" },
  { key: "dragon7Panda8", label: "Dragon 7 / Panda 8", hint: "Banker 3-card 7 pays 40:1 · Player 3-card 8 pays 25:1", ezOnly: true },
  { key: "bigSmall", label: "Big / Small", hint: "5–6 cards dealt (Big 0.54:1) or just 4 (Small 1.5:1)" },
];

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
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CreateBaccaratForm() {
  const [state, formAction] = useActionState(createBaccaratTableAction, {} as CreateBaccaratTableState);
  const [rules, setRules] = useState<BaccaratRules>(DEFAULT_BACCARAT_RULES);
  const [stakes, setStakes] = useState(1);
  const [seats, setSeats] = useState(7);
  const set = <K extends keyof BaccaratRules>(key: K, value: BaccaratRules[K]) => setRules((r) => ({ ...r, [key]: value }));
  const { min, max } = STAKES[stakes];
  const shown = { ...rules, dragon7Panda8: rules.variant === "ez" && rules.dragon7Panda8 };

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <input type="hidden" name="minBet" value={min} />
      <input type="hidden" name="maxBet" value={max} />

      <div className="flex flex-col gap-6">
        <section className="pixel-panel flex flex-col gap-5 p-5 sm:p-6">
          <h2 className="font-display text-sm text-neon-gold">Table</h2>
          <Field label="Table name" name="name" required maxLength={40} defaultValue="Orbital Baccarat" />
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[0.65rem] text-neon-cyan">Visibility</span>
            <select name="visibility" className="pixel-input" defaultValue="public">
              <option value="public">Public (listed on Tables)</option>
              <option value="private">Private (invite only)</option>
            </select>
          </label>
          <Choice
            legend="Bets (Player / Banker minimum – maximum)"
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
              max={7}
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
              className="mt-3 accent-neon-magenta"
            />
            <span className="text-sm text-starlight/60">1 for solo play. Everyone bets on the same hand.</span>
          </label>
        </section>

        <section className="pixel-panel flex flex-col gap-5 p-5 sm:p-6">
          <h2 className="font-display text-sm text-neon-gold">Rules</h2>
          <Choice
            legend="Version"
            name="variant"
            value={rules.variant}
            options={(Object.keys(VARIANT_NAMES) as BaccaratVariant[]).map((v) => ({ value: v, label: VARIANT_NAMES[v] }))}
            onChange={(v) => set("variant", v)}
          />
          <p className="text-sm text-starlight/70">{VARIANT_HINTS[rules.variant]}</p>
          <Choice
            legend="Decks in the shoe"
            name="decks"
            value={rules.decks}
            options={[
              { value: 8, label: "8 decks" },
              { value: 6, label: "6 decks" },
            ]}
            onChange={(v) => set("decks", v)}
          />
          <Choice
            legend="Tie pays"
            name="tiePays"
            value={rules.tiePays}
            options={[
              { value: 8, label: "8 to 1" },
              { value: 9, label: "9 to 1" },
            ]}
            onChange={(v) => set("tiePays", v)}
          />
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1.5 font-display text-[0.65rem] text-neon-cyan">Side bets</legend>
            {SIDES.map((b) => {
              const unavailable = b.ezOnly && rules.variant !== "ez";
              return (
                <label key={b.key} className={`flex items-start gap-3 ${unavailable ? "opacity-50" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    name={b.key}
                    checked={rules[b.key] && !unavailable}
                    disabled={unavailable}
                    onChange={(e) => set(b.key, e.target.checked)}
                    className="mt-1 size-4 accent-neon-magenta"
                  />
                  <span className="flex flex-col">
                    <span>{b.label}</span>
                    <span className="text-sm text-starlight/60">{unavailable ? "EZ Baccarat tables only" : b.hint}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        </section>
      </div>

      <aside className="pixel-panel flex flex-col gap-4 p-5 sm:p-6 lg:sticky lg:top-6">
        <h2 className="font-display text-sm text-neon-gold">Summary</h2>
        <p className="font-display text-[0.6rem] leading-relaxed text-neon-lime">{baccaratSummary(shown)}</p>
        <p className="text-sm text-starlight/80">
          Bets {formatChips(min)}–{formatChips(max)} · {seats} seat{seats === 1 ? "" : "s"}
        </p>
        <p className="text-sm text-starlight/80">
          House edge on Banker: <span className="text-neon-gold">{bankerEdge(rules)}%</span> · Player 1.24%
        </p>
        <FormMessage error={state.error} />
        <SubmitButton pendingText="Creating…">Create table</SubmitButton>
      </aside>
    </form>
  );
}
