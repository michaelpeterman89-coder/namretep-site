import { Bullets, Keys, PayTable, Section, Settings, Steps, Tip } from "../guide-parts";

export function PokerGuide() {
  return (
    <>
      <Section id="goal" title="The goal">
        <p>
          Texas Hold&apos;em is played against the other players, not the house. Win chips by having the best five-card
          hand at the end, or by betting so that everyone else folds. Tables here are <strong>No-Limit</strong>: you can
          bet any amount up to everything in front of you.
        </p>
        <p>
          Poker tables are <strong>cash games</strong>: you buy in for a stack of chips (taken from your balance), play
          as long as you like, and when you leave your whole stack goes back to your balance.
        </p>
      </Section>

      <Section id="round" title="How a hand goes">
        <Steps>
          <li>
            The two players left of the dealer button post the <strong>small blind</strong> and{" "}
            <strong>big blind</strong> (forced bets that start the pot). The button moves one seat each hand.
          </li>
          <li>Everyone gets two private cards (your &ldquo;hole cards&rdquo;).</li>
          <li>
            <strong>Pre-flop</strong> betting, starting left of the big blind. On your turn: <strong>Fold</strong>{" "}
            (give up), <strong>Check</strong> (pass, if nobody has bet), <strong>Call</strong> (match the bet), or{" "}
            <strong>Raise</strong>.
          </li>
          <li>
            The <strong>flop</strong>: three shared cards face up, then another round of betting.
          </li>
          <li>
            The <strong>turn</strong> (a fourth shared card) and the <strong>river</strong> (a fifth), each followed
            by betting.
          </li>
          <li>
            <strong>Showdown</strong>: players still in show their cards. The best five-card hand from your two cards
            plus the five shared cards wins the pot. If someone was all-in for less, side pots are split up fairly.
          </li>
        </Steps>
      </Section>

      <Section id="hands" title="Hand rankings (best first)">
        <PayTable
          columns={["Hand", "Example", "What it is"]}
          rows={[
            ["Royal flush", "A K Q J 10, all hearts", "The top straight flush"],
            ["Straight flush", "9 8 7 6 5, all clubs", "Five in a row, all one suit"],
            ["Four of a kind", "Q Q Q Q 4", "Four cards of one rank"],
            ["Full house", "8 8 8 3 3", "Three of a kind plus a pair"],
            ["Flush", "K 10 7 4 2, all spades", "Five cards of one suit"],
            ["Straight", "7 6 5 4 3", "Five in a row (A-2-3-4-5 counts)"],
            ["Three of a kind", "J J J 9 2", "Three cards of one rank"],
            ["Two pair", "10 10 6 6 A", "Two different pairs"],
            ["One pair", "5 5 K 9 2", "Two cards of one rank"],
            ["High card", "A J 8 6 3", "None of the above"],
          ]}
        />
      </Section>

      <Section id="settings" title="Table settings">
        <Settings
          items={[
            ["Stakes", "The blinds, from 1/2 up to 100/200."],
            ["Buy-in", "Between 20 and 100 big blinds."],
            ["Seats", "2 to 9 players."],
            [
              "Bots",
              "Computer players that fill empty seats so you always have a game. They leave when the last person leaves. Chips you win or lose against bots count toward your real balance.",
            ],
          ]}
        />
      </Section>

      <Section id="multiplayer" title="Timers and leaving">
        <Bullets>
          <li>With other people at the table, you get 25 seconds per decision. If time runs out you check if you can, otherwise fold.</li>
          <li>Leave table mid-hand and you&apos;re folded when your turn comes, then cashed out when the hand ends.</li>
          <li>If you lose your whole stack, you&apos;re cashed out automatically; sit down again to buy back in.</li>
        </Bullets>
      </Section>

      <Section id="controls" title="Controls">
        <Keys
          keys={[
            ["F", "Fold"],
            ["C", "Check or call"],
            ["R", "Raise (to the amount on the slider)"],
          ]}
        />
        <p>
          The <strong>Min</strong>, <strong>½ Pot</strong>, <strong>¾ Pot</strong>, <strong>Pot</strong>, and{" "}
          <strong>All-in</strong> buttons set the raise for you; fine-tune it with the slider.
        </p>
      </Section>

      <Section id="stats" title="Your poker stats">
        <p>Your profile tracks hands played and won, net chips, and a few numbers players use to read their own style:</p>
        <Bullets>
          <li>
            <strong>Voluntarily in pot</strong>: how often you put chips in before the flop when you didn&apos;t have to.
          </li>
          <li>
            <strong>Preflop raise</strong>: how often you raised before the flop.
          </li>
          <li>
            <strong>Showdowns won</strong>: of the hands that went to a showdown, how many you won.
          </li>
        </Bullets>
      </Section>

      <Section id="tips" title="Beginner tips">
        <Bullets>
          <li>Play fewer, stronger starting hands — big pairs and high cards like A-K, A-Q.</li>
          <li>Position matters: acting last (near the button) tells you what everyone else did first.</li>
          <li>Don&apos;t chase every draw; compare what you have to call with what&apos;s in the pot.</li>
        </Bullets>
        <Tip>More poker games — Omaha and Seven-Card Stud — are planned. They&apos;ll appear as choices when you create a poker table.</Tip>
      </Section>
    </>
  );
}
