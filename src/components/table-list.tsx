import Link from "next/link";
import { formatChips } from "@/lib/chips";
import { houseEdge, rulesSummary } from "@/lib/games/blackjack/rules";
import { tablePath } from "@/lib/games/catalog";
import { crapsSummary, passLineEdge } from "@/lib/games/craps/rules";
import { pokerSummary } from "@/lib/games/poker/table-rules";
import type { TableListing } from "@/server/tables";

/** Cards linking to tables, with each game's rules, bets, and open seats. */
export function TableList({ tables }: { tables: TableListing[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {tables.map((t) => {
        const open = t.seats - t.seated;
        return (
          <li key={t.id}>
            <Link
              href={tablePath(t.game, t.id)}
              className="pixel-panel flex flex-col gap-2 p-5 transition-transform hover:-translate-y-0.5"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{t.name}</span>
                <span className="shrink-0 font-display text-[0.55rem] text-starlight/60">
                  {t.visibility === "private" ? "Private" : "Public"}
                </span>
              </span>
              {t.game === "holdem" ? (
                <>
                  <span className="font-display text-[0.6rem] text-neon-magenta">{pokerSummary(t.rules)}</span>
                  <span className="text-sm text-starlight/70">
                    Buy-in {formatChips(t.rules.minBuyIn)}–{formatChips(t.rules.maxBuyIn)}
                    {t.rules.bots > 0 && ` · ${t.rules.bots} bot${t.rules.bots > 1 ? "s" : ""}`}
                  </span>
                </>
              ) : t.game === "craps" ? (
                <>
                  <span className="font-display text-[0.6rem] text-neon-gold">{crapsSummary(t.rules)}</span>
                  <span className="text-sm text-starlight/70">
                    Bets {formatChips(t.minBet)}–{formatChips(t.maxBet)} · Pass line edge {passLineEdge(t.rules)}%
                  </span>
                </>
              ) : (
                <>
                  <span className="font-display text-[0.6rem] text-neon-cyan">Blackjack · {rulesSummary(t.rules)}</span>
                  <span className="text-sm text-starlight/70">
                    Bets {formatChips(t.minBet)}–{formatChips(t.maxBet)} · House edge ≈ {houseEdge(t.rules).toFixed(2)}%
                  </span>
                </>
              )}
              <span className={`text-sm ${open > 0 ? "text-neon-gold" : "text-starlight/70"}`}>
                {t.seated} of {t.seats} seated · {open > 0 ? `${open} open` : "full (watch only)"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
