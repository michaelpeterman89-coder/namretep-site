import { describe, expect, it } from "vitest";
import { beadPlate, bigRoad, roadCounts, type RoadResult } from "./roads";
import { DEFAULT_BACCARAT_RULES, parseBaccaratRules, baccaratSummary } from "./rules";

const r = (w: "B" | "P" | "T", pairs = ""): RoadResult => ({
  winner: w === "B" ? "banker" : w === "P" ? "player" : "tie",
  playerPair: pairs.includes("p"),
  bankerPair: pairs.includes("b"),
  natural: false,
  total: 7,
});
const seq = (s: string) => [...s].map((c) => r(c as "B" | "P" | "T"));
const grid = (cells: ReturnType<typeof bigRoad>) => cells.map((c) => `${c.winner[0]}${c.col},${c.row}${c.ties ? `+${c.ties}t` : ""}`);

describe("Bead Plate", () => {
  it("fills columns of six from the top", () => {
    const cols = beadPlate(seq("BPBTPPBB"));
    expect(cols.map((c) => c.length)).toEqual([6, 2]);
    expect(cols[1][0].winner).toBe("banker");
  });
});

describe("Big Road", () => {
  it("runs streaks down a column and starts a new column when the winner changes", () => {
    expect(grid(bigRoad(seq("BBPPPB")))).toEqual(["b0,0", "b0,1", "p1,0", "p1,1", "p1,2", "b2,0"]);
  });

  it("marks ties on the result before them, and leading ties on the first result", () => {
    expect(grid(bigRoad(seq("TTBTTP")))).toEqual(["b0,0+4t", "p1,0"]);
    expect(grid(bigRoad(seq("BTP")))).toEqual(["b0,0+1t", "p1,0"]);
  });

  it("turns a long streak right along the bottom (dragon tail)", () => {
    const cells = bigRoad(seq("BBBBBBBBP"));
    expect(grid(cells).slice(4)).toEqual(["b0,4", "b0,5", "b1,5", "b2,5", "p1,0"]);
  });

  it("counts results", () => {
    expect(roadCounts(seq("BBPT"))).toEqual({ banker: 2, player: 1, tie: 1 });
  });
});

describe("baccarat settings", () => {
  it("accepts the defaults and summarises them", () => {
    expect(parseBaccaratRules(DEFAULT_BACCARAT_RULES)).toEqual({ ok: true, rules: { ...DEFAULT_BACCARAT_RULES, dragon7Panda8: false } });
    expect(baccaratSummary(DEFAULT_BACCARAT_RULES)).toBe("Baccarat · Classic · 8D · Tie 8:1");
  });

  it("keeps Dragon 7 / Panda 8 for EZ tables only and rejects bad settings", () => {
    expect(parseBaccaratRules({ ...DEFAULT_BACCARAT_RULES, variant: "ez" })).toMatchObject({ ok: true, rules: { dragon7Panda8: true } });
    expect(parseBaccaratRules({ ...DEFAULT_BACCARAT_RULES, decks: 4 })).toMatchObject({ ok: false, error: /6 or 8/ });
    expect(parseBaccaratRules({ ...DEFAULT_BACCARAT_RULES, tiePays: 10 })).toMatchObject({ ok: false });
    expect(parseBaccaratRules({ ...DEFAULT_BACCARAT_RULES, pairs: "yes" })).toMatchObject({ ok: false });
  });
});
