import { Bullets, Keys, PayTable, Section, Settings, Steps, Tip } from "../guide-parts";

export function BlackjackGuide() {
  return (
    <>
      <Section id="goal" title="The goal">
        <p>
          Beat the dealer by finishing closer to 21 than they do, without going over. You don&apos;t play against the
          other players at the table — everyone plays their own hand against the dealer.
        </p>
        <Bullets>
          <li>Number cards count their number. Jacks, queens, and kings count 10.</li>
          <li>
            An ace counts 11, or 1 if 11 would take you over 21. A hand with an ace counted as 11 is called{" "}
            <strong>soft</strong> (soft 17 = ace + 6).
          </li>
          <li>
            An ace and a 10-value card as your first two cards is a <strong>blackjack</strong>, the best hand.
          </li>
          <li>Going over 21 is a <strong>bust</strong>: you lose right away, even if the dealer busts later.</li>
        </Bullets>
      </Section>

      <Section id="round" title="How a round goes">
        <Steps>
          <li>
            Choose your bet (between the table&apos;s minimum and maximum) and press <strong>Deal</strong> — or{" "}
            <strong>Place bet</strong> when others are at the table.
          </li>
          <li>
            Cards come out of the shoe: two face up for each player, and two for the dealer with one face down (the
            &ldquo;hole card&rdquo;). At a table where the dealer doesn&apos;t peek, the dealer takes their second card
            only after everyone has played.
          </li>
          <li>
            If the dealer shows an ace, you may be offered <strong>insurance</strong> (and early surrender, if the table
            allows it). With peeking on, the dealer then checks for blackjack, and the round ends at once if they have
            it.
          </li>
          <li>
            On your turn, choose: <strong>Hit</strong> (take a card), <strong>Stand</strong> (stop),{" "}
            <strong>Double</strong> (double your bet, take exactly one more card), <strong>Split</strong> (turn a pair
            into two hands, each with its own bet), or <strong>Surrender</strong> (give up half your bet and end the
            hand).
          </li>
          <li>
            The dealer turns over the hole card and must draw until they reach 17 or more. On an H17 table the dealer
            also hits a soft 17.
          </li>
          <li>Bets are paid, chips slide back to the dealer&apos;s tray, and the table clears for the next round.</li>
        </Steps>
      </Section>

      <Section id="payouts" title="What wins and what it pays">
        <PayTable
          columns={["Result", "When", "Pays"]}
          rows={[
            ["Win", "Your total beats the dealer's, or the dealer busts", "1 to 1"],
            ["Blackjack", "Ace + 10-value card as your first two cards", "3 to 2, 6 to 5, or 1 to 1 (table setting)"],
            ["Push", "You tie the dealer", "Your bet comes back"],
            ["Insurance", "The dealer has blackjack (costs half your bet)", "2 to 1"],
            ["Surrender", "You give up the hand", "Half your bet comes back"],
          ]}
        />
        <p>
          Every table shows its rules summary (for example <span className="font-display text-[0.6rem]">6D · S17 · 3:2 · DAS · LS</span>) and an
          approximate house edge for that rule set.
        </p>
      </Section>

      <Section id="settings" title="Table settings">
        <p>Whoever creates the table picks the rules. These are the ones that change the game most:</p>
        <Settings
          items={[
            ["Decks", "1, 2, 4, 6, or 8. Fewer decks are slightly better for you."],
            ["Dealer on soft 17", "S17 (stands) is better for you than H17 (hits)."],
            ["Blackjack pays", "3:2 is standard. 6:5 and 1:1 cost you a lot more over time."],
            ["Dealer peeks", "US style: the dealer checks for blackjack early, so you never lose a double or split to it. European style: no hole card."],
            ["Double down on", "Any first two cards, 9–11 only, or 10–11 only."],
            ["Double after split (DAS)", "Whether you can double on hands made by splitting."],
            ["Max hands from splitting", "2, 3, or 4 hands from one round."],
            ["Re-split / hit split aces", "Whether split aces can be split again or take more than one card."],
            ["Surrender", "None, late (after the dealer peeks), or early (before)."],
            ["Insurance", "Whether insurance is offered at all."],
            ["Shuffle point", "How deep into the shoe the dealer goes before reshuffling."],
          ]}
        />
      </Section>

      <Section id="on-book" title="On Book %">
        <p>
          Every decision you make (hit, stand, double, split, surrender, insurance) is compared with{" "}
          <strong>basic strategy</strong> — the mathematically best play — for your table&apos;s exact rules. Your{" "}
          <strong>On Book %</strong> is how often you matched it. Your profile shows it overall, by rule set, and the
          situations you miss most (like &ldquo;soft 18 vs dealer 9&rdquo;).
        </p>
        <p>
          Turn on <strong>Show hints</strong> at the table to see the book play after a mistake. Hands played with hints
          on are counted separately so they don&apos;t inflate your score.
        </p>
      </Section>

      <Section id="multiplayer" title="Playing with others">
        <Bullets>
          <li>Betting stays open for 15 seconds after the first bet, then the cards come out for everyone who bet.</li>
          <li>You get 25 seconds for each decision. If time runs out you stand automatically.</li>
          <li>If you don&apos;t bet before the cards come out, you sit out until you place a bet again.</li>
          <li>Playing alone, there are no timers: take as long as you like.</li>
        </Bullets>
      </Section>

      <Section id="controls" title="Controls">
        <Keys
          keys={[
            ["Enter", "Place bet"],
            ["H", "Hit"],
            ["S", "Stand"],
            ["D", "Double"],
            ["P", "Split"],
            ["R", "Surrender"],
            ["I", "Insurance"],
            ["N", "No insurance"],
          ]}
        />
      </Section>

      <Section id="tips" title="Beginner tips">
        <Bullets>
          <li>Always split aces and 8s. Never split 10s or 5s.</li>
          <li>Double on 11 against almost anything, and on 10 against a dealer 2–9.</li>
          <li>Stand on hard 17 or more. Hit hard 12–16 when the dealer shows 7 or higher.</li>
          <li>Skip insurance: it&apos;s a side bet the house wins over time.</li>
        </Bullets>
        <Tip>Play a few rounds with hints on — it&apos;s the fastest way to learn the book.</Tip>
      </Section>
    </>
  );
}
