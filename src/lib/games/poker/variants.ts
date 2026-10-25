import type { HandRule } from "./evaluator";

// A poker variant is described as data: what each betting round deals, and
// which cards make a hand. Hold'em is the first; Omaha is the same shape with
// four hole cards and the "omaha" rule. Stud (up cards, antes, bring-in) will
// add fields here when it's built.

export type StreetName = "preflop" | "flop" | "turn" | "river";

export type StreetSpec = {
  name: StreetName;
  /** Private cards dealt to each player at the start of this street. */
  hole: number;
  /** Shared cards dealt to the board at the start of this street. */
  board: number;
};

export type VariantSpec = {
  id: VariantId;
  name: string;
  streets: StreetSpec[];
  handRule: HandRule;
  minPlayers: number;
  maxPlayers: number;
};

export type VariantId = "holdem" | "omaha";

const COMMUNITY_STREETS = (holeCards: number): StreetSpec[] => [
  { name: "preflop", hole: holeCards, board: 0 },
  { name: "flop", hole: 0, board: 3 },
  { name: "turn", hole: 0, board: 1 },
  { name: "river", hole: 0, board: 1 },
];

export const VARIANTS: Record<VariantId, VariantSpec> = {
  holdem: {
    id: "holdem",
    name: "Texas Hold'em",
    streets: COMMUNITY_STREETS(2),
    handRule: "best-five",
    minPlayers: 2,
    maxPlayers: 9,
  },
  // Defined so the engine is exercised with it in tests; not offered at tables yet.
  omaha: {
    id: "omaha",
    name: "Omaha",
    streets: COMMUNITY_STREETS(4),
    handRule: "omaha",
    minPlayers: 2,
    maxPlayers: 9,
  },
};

/** Betting structure. Only No-Limit is offered for now; the engine has the hook. */
export type BettingStructure = "no-limit";
