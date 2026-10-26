import type { BetKind, Dice, RollEvent } from "./engine";

// Plain-English names for bets and rolls.

const NAMES: Record<BetKind, string> = {
  pass: "Pass Line",
  dontPass: "Don't Pass",
  come: "Come",
  dontCome: "Don't Come",
  odds: "Odds",
  layOdds: "Lay odds",
  place: "Place",
  buy: "Buy",
  lay: "Lay",
  big6: "Big 6",
  big8: "Big 8",
  field: "Field",
  hard: "Hard",
  any7: "Any 7",
  anyCraps: "Any Craps",
  two: "Snake Eyes (2)",
  three: "Ace-Deuce (3)",
  yo: "Yo (11)",
  twelve: "Boxcars (12)",
  horn: "Horn",
  ce: "C & E",
  world: "World",
  hop: "Hop",
  fire: "Fire Bet",
  allSmall: "All Small",
  allTall: "All Tall",
  makeEmAll: "Make 'Em All",
};

/** "Place 8", "Come 9", "Hop 2-4", "Pass Line", … */
export function betName(kind: BetKind, number: number | null, dice?: Dice): string {
  const base = NAMES[kind];
  if (kind === "hop" && dice) return `${base} ${dice[0]}-${dice[1]}`;
  if (["place", "buy", "lay", "hard", "come", "dontCome"].includes(kind) && number !== null) return `${base} ${number}`;
  if ((kind === "odds" || kind === "layOdds") && number !== null) return `${base} on ${number}`;
  return base;
}

/** What the stickman calls: "Seven out", "Yo eleven", "Hard eight", "The point is 6", … */
export function callRoll(event: RollEvent, dice: Dice, point: number | null): string {
  const total = dice[0] + dice[1];
  const hard = dice[0] === dice[1];
  switch (event) {
    case "sevenOut":
      return "Seven out";
    case "pointMade":
      return `Winner! The point ${total} is made`;
    case "pointSet":
      return `The point is ${total}`;
    case "natural":
      return total === 11 ? "Yo eleven — winner!" : "Seven — winner!";
    case "craps":
      return total === 2 ? "Craps: snake eyes" : total === 3 ? "Craps: ace-deuce" : "Craps: boxcars";
    default:
      if (total === 11) return "Yo eleven";
      if (hard && [4, 6, 8, 10].includes(total)) return `Hard ${total}`;
      return point === null ? `${total}` : `${total} — the point is ${point}`;
  }
}
