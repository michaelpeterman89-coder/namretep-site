"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import {
  DECK_OPTIONS,
  DEFAULT_RULES,
  houseEdge,
  PENETRATION_MAX,
  PENETRATION_MIN,
  rulesSummary,
  type BlackjackRules,
} from "@/lib/games/blackjack/rules";
import { createTableAction, type CreateTableState } from "../actions";

const PRESETS: { name: string; rules: BlackjackRules }[] = [
  { name: "Classic Strip", rules: DEFAULT_RULES },
  {
    name: "Single deck",
    rules: { ...DEFAULT_RULES, decks: 1, dealerHitsSoft17: true, doubleAfterSplit: false, maxSplitHands: 2, surrender: "none" },
  },
  {
    name: "Euro no-hole-card",
    rules: { ...DEFAULT_RULES, dealerPeeks: false, doubleOn: "9-11", maxSplitHands: 2, surrender: "none" },
  },
  {
    name: "Tourist trap 6:5",
    rules: { ...DEFAULT_RULES, decks: 8, dealerHitsSoft17: true, blackjackPayout: "6:5", surrender: "none" },
  },
];

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-display text-[0.65rem] text-neon-cyan">{label}</span>
      <select
        className="pixel-input"
        value={String(value)}
        onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md border-2 border-space-700 px-3 py-2.5 has-checked:border-neon-cyan">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 accent-neon-cyan"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pixel-panel flex flex-col gap-5 p-5 sm:p-6">
      <h2 className="font-display text-sm text-neon-gold">{title}</h2>
      {children}
    </section>
  );
}

export function CreateTableForm() {
  const [state, formAction] = useActionState(createTableAction, {} as CreateTableState);
  const [rules, setRules] = useState<BlackjackRules>(DEFAULT_RULES);
  const set = <K extends keyof BlackjackRules>(key: K) => (value: BlackjackRules[K]) =>
    setRules((r) => ({ ...r, [key]: value }));

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <input type="hidden" name="rules" value={JSON.stringify(rules)} />

      <div className="flex flex-col gap-6">
        <Section title="Table">
          <Field label="Table name" name="name" required maxLength={40} defaultValue="My table" />
          <div className="grid gap-5 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-display text-[0.65rem] text-neon-cyan">Visibility</span>
              <select name="visibility" className="pixel-input" defaultValue="private">
                <option value="private">Private (invite only)</option>
                <option value="public">Public (listed on Tables)</option>
              </select>
            </label>
            <Field label="Min bet" name="minBet" type="number" required min={1} defaultValue={10} />
            <Field label="Max bet" name="maxBet" type="number" required min={1} max={1_000_000} defaultValue={500} />
          </div>
          <Field
            label="Seats"
            name="seats"
            type="number"
            required
            min={1}
            max={7}
            defaultValue={1}
            hint="1 for solo play. With more seats, others can join from the Tables page (public) or your invite link (private)."
          />
        </Section>

        <Section title="Rules">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => setRules(preset.rules)}
                className="rounded-md border-2 border-space-700 px-3 py-1.5 text-sm hover:border-neon-gold hover:text-neon-gold"
              >
                {preset.name}
              </button>
            ))}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Choice
              label="Decks"
              value={rules.decks}
              options={DECK_OPTIONS.map((d) => ({ value: d, label: `${d} deck${d > 1 ? "s" : ""}` }))}
              onChange={set("decks")}
            />
            <Choice
              label="Blackjack pays"
              value={rules.blackjackPayout}
              options={[
                { value: "3:2", label: "3:2 (best)" },
                { value: "6:5", label: "6:5" },
                { value: "1:1", label: "1:1 (even money)" },
              ]}
              onChange={set("blackjackPayout")}
            />
            <Choice
              label="Dealer on soft 17"
              value={rules.dealerHitsSoft17 ? "hit" : "stand"}
              options={[
                { value: "stand", label: "Stands (S17)" },
                { value: "hit", label: "Hits (H17)" },
              ]}
              onChange={(v) => set("dealerHitsSoft17")(v === "hit")}
            />
            <Choice
              label="Dealer peeks for blackjack"
              value={rules.dealerPeeks ? "yes" : "no"}
              options={[
                { value: "yes", label: "Yes (US style)" },
                { value: "no", label: "No (European, no hole card)" },
              ]}
              onChange={(v) => set("dealerPeeks")(v === "yes")}
            />
            <Choice
              label="Double down on"
              value={rules.doubleOn}
              options={[
                { value: "any", label: "Any first two cards" },
                { value: "9-11", label: "9, 10, or 11 only" },
                { value: "10-11", label: "10 or 11 only" },
              ]}
              onChange={set("doubleOn")}
            />
            <Choice
              label="Max hands from splitting"
              value={rules.maxSplitHands}
              options={[2, 3, 4].map((n) => ({ value: n as 2 | 3 | 4, label: `${n} hands` }))}
              onChange={set("maxSplitHands")}
            />
            <Choice
              label="Surrender"
              value={rules.surrender}
              options={[
                { value: "none", label: "Not allowed" },
                { value: "late", label: "Late (after dealer peeks)" },
                { value: "early", label: "Early (before dealer peeks)" },
              ]}
              onChange={set("surrender")}
            />
            <label className="flex flex-col gap-1.5">
              <span className="font-display text-[0.65rem] text-neon-cyan">
                Shuffle at {Math.round(rules.penetration * 100)}% of the shoe
              </span>
              <input
                type="range"
                min={PENETRATION_MIN * 100}
                max={PENETRATION_MAX * 100}
                step={5}
                value={Math.round(rules.penetration * 100)}
                onChange={(e) => set("penetration")(Number(e.target.value) / 100)}
                className="mt-3 accent-neon-magenta"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle label="Double after split (DAS)" checked={rules.doubleAfterSplit} onChange={set("doubleAfterSplit")} />
            <Toggle label="Re-split aces" checked={rules.resplitAces} onChange={set("resplitAces")} />
            <Toggle label="Hit split aces" checked={rules.hitSplitAces} onChange={set("hitSplitAces")} />
            <Toggle label="Insurance offered" checked={rules.insurance} onChange={set("insurance")} />
          </div>
        </Section>
      </div>

      <aside className="pixel-panel flex flex-col gap-4 p-5 sm:p-6 lg:sticky lg:top-6">
        <h2 className="font-display text-sm text-neon-gold">Summary</h2>
        <p className="font-display text-xs leading-relaxed text-starlight">{rulesSummary(rules)}</p>
        <p>
          <span className="text-starlight/70">House edge ≈ </span>
          <span className="font-display text-sm text-neon-cyan">{houseEdge(rules).toFixed(2)}%</span>
        </p>
        <p className="text-sm text-starlight/60">
          Approximate edge with perfect basic strategy. Lower is better for you.
        </p>
        <FormMessage error={state.error} />
        <SubmitButton pendingText="Creating…">Create table</SubmitButton>
      </aside>
    </form>
  );
}
