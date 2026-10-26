import { Bullets, Keys, PayTable, Section, Settings, Steps, Tip } from "../guide-parts";

export function CrapsGuide() {
  return (
    <>
      <Section id="goal" title="The idea">
        <p>
          Craps is a dice game where everyone bets on the same rolls of two dice. One player, the{" "}
          <strong>shooter</strong>, rolls; everyone else (including the shooter) bets against the house. There are
          dozens of bets, but you only need one to start: the <strong>Pass Line</strong>.
        </p>
      </Section>

      <Section id="round" title="How the game flows">
        <Steps>
          <li>
            <strong>Come-out roll.</strong> With no point set, a 7 or 11 is a <strong>natural</strong> (Pass Line
            wins). A 2, 3, or 12 is <strong>craps</strong> (Pass Line loses). Any other number — 4, 5, 6, 8, 9, or 10 —
            becomes the <strong>point</strong>, marked by the ON puck.
          </li>
          <li>
            <strong>Making the point.</strong> The shooter keeps rolling. Roll the point again before a 7 and the Pass
            Line wins; the next roll is a new come-out.
          </li>
          <li>
            <strong>Seven out.</strong> A 7 before the point ends the shooter&apos;s turn: Pass Line bets lose, and the
            dice pass to the next player.
          </li>
        </Steps>
        <p>
          Most other bets can be made at any time and are settled whenever their numbers come up. Place, Buy, hardway,
          and come-odds bets are <strong>off</strong> on the come-out roll unless you turn them on.
        </p>
      </Section>

      <Section id="crapless" title="Crapless craps">
        <p>
          In crapless craps, 2, 3, 11, and 12 become points instead of winning or losing on the come-out, so the only
          come-out decision is a 7 (which wins). The catch: you lose the easy 11 win, and the Pass Line house edge goes
          up from 1.41% to 5.38%. There are no Don&apos;t bets, and you can place 2, 3, 11, and 12.
        </p>
      </Section>

      <Section id="bets" title="The bets">
        <h3 className="font-display text-[0.65rem] text-neon-cyan">Line bets — the best bets on the table</h3>
        <PayTable
          rows={[
            ["Pass Line", "7/11 on the come-out, or the point before a 7", "1 to 1", "1.41% (crapless 5.38%)"],
            ["Don't Pass", "2/3 on the come-out (12 ties), or 7 before the point", "1 to 1", "1.36%"],
            ["Come / Don't Come", "Like Pass / Don't Pass, but made once a point is set; travels to its own number", "1 to 1", "Same as Pass / Don't Pass"],
            [
              "Odds",
              "Extra bet behind a Pass, Don't Pass, Come, or Don't Come bet with a point",
              "True odds: 4/10 2:1, 5/9 3:2, 6/8 6:5 (crapless 2/12 6:1, 3/11 3:1); laying odds pays the reverse",
              "0% — the only bet with no house edge",
            ],
          ]}
        />
        <h3 className="font-display text-[0.65rem] text-neon-cyan">Number bets</h3>
        <PayTable
          rows={[
            ["Place 6 or 8", "Your number before a 7", "7 to 6", "1.52%"],
            ["Place 5 or 9", "Your number before a 7", "7 to 5", "4.00%"],
            ["Place 4 or 10", "Your number before a 7", "9 to 5", "6.67%"],
            ["Place 2/12, 3/11 (crapless)", "Your number before a 7", "11 to 2, 11 to 4", "7.14%, 6.25%"],
            ["Buy", "Your number before a 7", "True odds, less 5% commission", "1.67% on 4/10 (commission on wins)"],
            ["Lay", "A 7 before your number", "True odds against, less 5% of the win", "2.44% on 4/10 (commission on wins)"],
            ["Big 6 / Big 8", "That number before a 7", "1 to 1", "9.09%"],
          ]}
        />
        <h3 className="font-display text-[0.65rem] text-neon-cyan">One-roll and proposition bets</h3>
        <PayTable
          rows={[
            ["Field", "Next roll is 2, 3, 4, 9, 10, 11, or 12", "1:1; 2 pays 2:1; 12 pays 2:1 or 3:1", "2.78% (12 pays 3:1)"],
            ["Hard 6 / Hard 8", "3+3 / 4+4 before a 7 or the easy way", "9 to 1", "9.09%"],
            ["Hard 4 / Hard 10", "2+2 / 5+5 before a 7 or the easy way", "7 to 1", "11.11%"],
            ["Any 7", "Next roll is a 7", "4 to 1", "16.67%"],
            ["Any Craps", "Next roll is 2, 3, or 12", "7 to 1", "11.11%"],
            ["2 or 12", "Next roll is that number", "30 to 1", "13.89%"],
            ["3 or 11", "Next roll is that number", "15 to 1", "11.11%"],
            ["Horn", "One chip each on 2, 3, 11, 12", "The winning part pays; the rest lose", "12.5%"],
            ["C & E", "One chip each on Any Craps and 11", "The winning part pays; the other loses", "11.11%"],
            ["World", "Horn plus Any 7 (a 7 is a wash)", "The winning part pays; the rest lose", "13.33%"],
            ["Hop", "An exact pair of dice on the next roll", "15 to 1 (doubles 30 to 1)", "11.11% (13.89%)"],
          ]}
        />
        <h3 className="font-display text-[0.65rem] text-neon-cyan">Bonus bets</h3>
        <PayTable
          rows={[
            ["Fire Bet", "The shooter makes 4, 5, or 6 different points before sevening out (made before the shooter's first roll)", "24:1, 249:1, 999:1", "about 21%"],
            ["All Small", "2, 3, 4, 5, and 6 all roll before a 7", "34 to 1", "about 7.5%"],
            ["All Tall", "8, 9, 10, 11, and 12 all roll before a 7", "34 to 1", "about 7.5%"],
            ["Make 'Em All", "Every number 2–12 (except 7) before a 7", "175 to 1", "about 8%"],
          ]}
        />
        <p className="text-sm text-starlight/70">
          The house edge is how much of each bet the house keeps on average over time. Lower is better for you. Bonus-bet
          edges are approximate.
        </p>
      </Section>

      <Section id="settings" title="Table settings">
        <Settings
          items={[
            ["Game", "Craps or crapless craps."],
            ["Odds allowed", "1x, 2x, 3-4-5x (3x on 4/10, 4x on 5/9, 5x on 6/8), 5x, 10x, or 100x your line bet."],
            ["Field pays on 12", "3 to 1 (better for you) or 2 to 1."],
            ["Buy & lay commission", "Charged only when the bet wins, or up front when you make it."],
            ["Bonus bets", "Props & hardways, hops, the Fire Bet, and All Small / Tall / Make 'Em All can each be turned off."],
          ]}
        />
      </Section>

      <Section id="playing" title="Betting and rolling here">
        <Bullets>
          <li>Pick a chip, then click a spot on the felt. Click again to add more. Horn, C&amp;E, and World use one chip per part.</li>
          <li>
            <strong>Your bets</strong> lists everything you have down, with buttons to add <strong>max odds</strong>,
            switch a bet <strong>on or off</strong> for the come-out roll, and <strong>take bets down</strong>. Pass and
            Come bets can&apos;t come down once they have a point, and bonus bets stay up once rolling starts.
          </li>
          <li>Winning bets stay up for the next roll (only the winnings are paid), except Come bets and odds, which come back to you.</li>
          <li>
            With others at the table, everyone gets about 8 seconds to bet before each roll. A shooter who doesn&apos;t
            roll for 30 seconds passes the dice.
          </li>
          <li>Leaving takes down every bet that&apos;s allowed to come down; the rest stay up and still pay you.</li>
        </Bullets>
        <Keys keys={[["R", "Roll (when you're the shooter)"], ["Space", "Roll"]]} />
      </Section>

      <Section id="tips" title="Beginner tips">
        <Bullets>
          <li>Start with the Pass Line, then add odds once a point is set — it&apos;s the best deal in the casino.</li>
          <li>Place 6 and 8 are the next-best bets.</li>
          <li>Props, hops, and bonus bets are fun but expensive: keep them small.</li>
        </Bullets>
        <Tip>Every spot on the felt shows what it pays (screen readers announce it too), so you can learn as you go.</Tip>
      </Section>
    </>
  );
}
