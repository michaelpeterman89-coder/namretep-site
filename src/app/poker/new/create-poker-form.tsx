"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/form";
import { formatChips } from "@/lib/chips";
import { DEFAULT_POKER_RULES } from "@/lib/games/poker/table-rules";
import { createPokerTableAction, type CreatePokerTableState } from "../actions";

const STAKES = [
  { label: "Micro · 1/2", sb: 1, bb: 2 },
  { label: "Low · 5/10", sb: 5, bb: 10 },
  { label: "Mid · 25/50", sb: 25, bb: 50 },
  { label: "High · 100/200", sb: 100, bb: 200 },
];

export function CreatePokerForm() {
  const [state, formAction] = useActionState(createPokerTableAction, {} as CreatePokerTableState);
  const [stakes, setStakes] = useState(1);
  const [seats, setSeats] = useState(6);
  const [bots, setBots] = useState(DEFAULT_POKER_RULES.bots);
  const { sb, bb } = STAKES[stakes];
  // Standard buy-in range: 20 to 100 big blinds.
  const minBuyIn = bb * 20;
  const maxBuyIn = bb * 100;

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <input type="hidden" name="smallBlind" value={sb} />
      <input type="hidden" name="bigBlind" value={bb} />
      <input type="hidden" name="minBuyIn" value={minBuyIn} />
      <input type="hidden" name="maxBuyIn" value={maxBuyIn} />

      <section className="pixel-panel flex flex-col gap-5 p-5 sm:p-6">
        <h2 className="font-display text-sm text-neon-gold">Table</h2>
        <Field label="Table name" name="name" required maxLength={40} defaultValue="Space Hold'em" />
        <label className="flex flex-col gap-1.5">
          <span className="font-display text-[0.65rem] text-neon-cyan">Visibility</span>
          <select name="visibility" className="pixel-input" defaultValue="public">
            <option value="public">Public (listed on Tables)</option>
            <option value="private">Private (invite only)</option>
          </select>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 font-display text-[0.65rem] text-neon-cyan">Stakes (small / big blind)</legend>
          <div className="flex flex-wrap gap-2">
            {STAKES.map((s, i) => (
              <label
                key={s.label}
                className="cursor-pointer rounded-md border-2 border-space-700 px-3 py-1.5 text-sm has-checked:border-neon-gold has-checked:text-neon-gold"
              >
                <input type="radio" name="stakes" checked={stakes === i} onChange={() => setStakes(i)} className="sr-only" />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[0.65rem] text-neon-cyan">Seats: {seats}</span>
            <input
              type="range"
              name="seats"
              min={2}
              max={9}
              value={seats}
              onChange={(e) => {
                const n = Number(e.target.value);
                setSeats(n);
                setBots((b) => Math.min(b, n - 1));
              }}
              className="mt-3 accent-neon-magenta"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[0.65rem] text-neon-cyan">Bots: {bots}</span>
            <input
              type="range"
              name="bots"
              min={0}
              max={seats - 1}
              value={bots}
              onChange={(e) => setBots(Number(e.target.value))}
              className="mt-3 accent-neon-cyan"
            />
          </label>
        </div>
        <p className="text-sm text-starlight/70">
          Bots fill seats so you can play any time, and leave room for real players. Chips you win from bots are yours to
          keep.
        </p>
      </section>

      <aside className="pixel-panel flex flex-col gap-4 p-5 sm:p-6 lg:sticky lg:top-6">
        <h2 className="font-display text-sm text-neon-gold">Summary</h2>
        <p className="font-display text-xs leading-relaxed text-starlight">
          No-Limit Hold&apos;em · {formatChips(sb)}/{formatChips(bb)}
        </p>
        <p className="text-sm text-starlight/80">
          Buy-in {formatChips(minBuyIn)}–{formatChips(maxBuyIn)} chips (20–100 big blinds)
          <br />
          {seats} seats · {bots === 0 ? "people only" : `${bots} bot${bots > 1 ? "s" : ""}`}
        </p>
        <FormMessage error={state.error} />
        <SubmitButton pendingText="Creating…">Create table</SubmitButton>
      </aside>
    </form>
  );
}
