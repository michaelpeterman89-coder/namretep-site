import { Bullets, Keys, PayTable, Section, Settings, Steps, Tip } from "../guide-parts";

export function BaccaratGuide() {
  return (
    <>
      <Section id="goal" title="The idea">
        <p>
          Two hands are dealt — <strong>Player</strong> and <strong>Banker</strong> — and you bet on which will finish
          closer to 9, or on a <strong>Tie</strong>. Nobody makes decisions once the cards are out: the dealer follows
          fixed drawing rules, so baccarat is all about your bets.
        </p>
        <Bullets>
          <li>Aces count 1, cards 2–9 count their number, and 10s and face cards count 0.</li>
          <li>Only the last digit of the total matters: 7 + 8 = 15 counts as 5.</li>
          <li>An 8 or 9 in the first two cards is a <strong>natural</strong>: both hands stop there.</li>
        </Bullets>
      </Section>

      <Section id="round" title="How a hand goes">
        <Steps>
          <li>Place your bets, then press Deal.</li>
          <li>Four cards come out of the shoe: Player, Banker, Player, Banker. The Player hand turns over, then the Banker hand.</li>
          <li>
            If neither hand has a natural, the Player draws a third card on 0–5 and stands on 6–7.
          </li>
          <li>
            The Banker then draws or stands by the table below (if the Player stood, the Banker draws on 0–5).
          </li>
          <li>The higher total wins. Bets are paid and the result goes on the scoreboards.</li>
        </Steps>
        <PayTable
          columns={["Banker has", "Banker draws when the Player's third card is"]}
          rows={[
            ["0, 1, 2", "Anything"],
            ["3", "Anything except 8"],
            ["4", "2 through 7"],
            ["5", "4 through 7"],
            ["6", "6 or 7"],
            ["7", "Never — stands"],
          ]}
        />
      </Section>

      <Section id="versions" title="Versions">
        <Settings
          items={[
            ["Classic", "Banker wins pay 19 to 20 — a 5% commission — because the Banker hand wins slightly more often."],
            ["No-commission (Super 6)", "Banker wins pay even money, except a winning Banker 6 pays only half."],
            ["EZ Baccarat", "Banker wins pay even money, but a Banker win with a three-card 7 is a push. Adds the Dragon 7 and Panda 8 side bets."],
          ]}
        />
      </Section>

      <Section id="bets" title="The bets (8 decks)">
        <PayTable
          rows={[
            ["Banker", "Banker wins (ties push)", "19:20 classic; 1:1 no-commission and EZ", "1.06% classic · 1.46% Super 6 · 1.02% EZ"],
            ["Player", "Player wins (ties push)", "1 to 1", "1.24%"],
            ["Tie", "Both totals are the same", "8 to 1 or 9 to 1", "14.36% at 8:1 · 4.84% at 9:1"],
            ["Player / Banker Pair", "That hand's first two cards are a pair", "11 to 1", "10.36%"],
            ["Either Pair", "Either hand's first two cards are a pair", "5 to 1", "13.71%"],
            ["Perfect Pair", "A pair of the same suit (both hands: 200 to 1)", "25 to 1", "High"],
            ["Dragon Bonus", "Your side wins by 4+ (9 pays 30:1) or with a natural (1:1; natural tie pushes)", "1:1 up to 30:1", "2.65% Player · 9.37% Banker"],
            ["Dragon 7 (EZ)", "Banker wins with a three-card 7", "40 to 1", "7.61%"],
            ["Panda 8 (EZ)", "Player wins with a three-card 8", "25 to 1", "10.19%"],
            ["Big", "5 or 6 cards are dealt", "0.54 to 1", "4.35%"],
            ["Small", "Only 4 cards are dealt", "1.5 to 1", "5.28%"],
          ]}
        />
        <p className="text-sm text-starlight/70">
          The table minimum applies to Player and Banker; the Tie and side bets can be as small as 1 chip.
        </p>
      </Section>

      <Section id="scoreboards" title="The scoreboards">
        <p>Baccarat tables track every result in the current shoe. Many players like to follow the patterns.</p>
        <Bullets>
          <li>
            <strong>Bead Plate</strong>: every hand in order, top to bottom and then left to right. Pink is Banker, cyan
            is Player, green is Tie.
          </li>
          <li>
            <strong>Big Road</strong>: each streak of Banker or Player wins runs down one column; a new column starts
            when the winner changes. Ties are marked on the result before them, and a long streak turns right along the
            bottom (the &ldquo;dragon tail&rdquo;).
          </li>
          <li>Small dots mark pairs: pink for a Banker pair, cyan for a Player pair. A fresh shoe starts the boards over.</li>
        </Bullets>
        <Tip>Every hand is independent — the scoreboards are for fun, not for predicting the next result.</Tip>
      </Section>

      <Section id="playing" title="Betting and dealing here">
        <Bullets>
          <li>Pick a chip, then click Player, Banker, Tie, or a side bet. Click again to add more.</li>
          <li>
            <strong>Rebet</strong> puts last hand&apos;s bets down again; <strong>Clear bets</strong> takes yours back
            before the deal.
          </li>
          <li>
            With others at the table, everyone bets on the same hand. The first bet starts a 15-second countdown; the
            cards come out when everyone who bet has pressed Deal, or when time runs out.
          </li>
          <li>Leaving the table gives back any bets that haven&apos;t been dealt.</li>
        </Bullets>
        <Keys keys={[["D", "Deal (or say you're ready)"]]} />
      </Section>

      <Section id="tips" title="Beginner tips">
        <Bullets>
          <li>Banker is the best bet even with the commission; Player is a close second.</li>
          <li>The Tie pays well but has a big house edge at 8 to 1 — look for 9 to 1 tables.</li>
        </Bullets>
      </Section>
    </>
  );
}
