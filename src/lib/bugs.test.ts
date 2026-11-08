import { describe, expect, it } from "vitest";
import {
  BUG_BODY_MAX,
  BUG_COMMENT_MAX,
  BUG_TITLE_MAX,
  bugStatus,
  cleanBugText,
  isBugStatus,
  parseBugId,
  validateBugComment,
  validateBugReport,
} from "./bugs";

describe("bug statuses", () => {
  it("knows the statuses and rejects anything else", () => {
    for (const key of ["new", "expected", "in_progress", "planned", "fixed", "other"]) {
      expect(isBugStatus(key)).toBe(true);
    }
    expect(isBugStatus("closed")).toBe(false);
    expect(isBugStatus(null)).toBe(false);
  });

  it("labels a status, and falls back rather than breaking", () => {
    expect(bugStatus("in_progress").label).toBe("In progress");
    expect(bugStatus("nonsense").label).toBe("Other");
  });
});

describe("parseBugId", () => {
  it("accepts report numbers only", () => {
    expect(parseBugId("12")).toBe(12);
    for (const bad of ["0", "-1", "1.5", "abc", "12; drop", "", "9999999999999999", null, 12]) {
      expect(parseBugId(bad)).toBeNull();
    }
  });
});

describe("cleanBugText", () => {
  it("trims and evens out line endings", () => {
    expect(cleanBugText("  one\r\ntwo\rthree \n")).toBe("one\ntwo\nthree");
    expect(cleanBugText(null)).toBe("");
  });
});

describe("validation", () => {
  const body = "The cards froze after I hit.";

  it("accepts a normal report", () => {
    expect(validateBugReport("Cards froze", body)).toBeNull();
  });

  it("rejects titles and descriptions outside the limits", () => {
    expect(validateBugReport("Oops", body)).toMatch(/title/);
    expect(validateBugReport("x".repeat(BUG_TITLE_MAX + 1), body)).toMatch(/title/);
    expect(validateBugReport("Cards froze", "broken")).toMatch(/detail/);
    expect(validateBugReport("Cards froze", "x".repeat(BUG_BODY_MAX + 1))).toMatch(/under/);
  });

  it("checks comments", () => {
    expect(validateBugComment("Same here")).toBeNull();
    expect(validateBugComment("")).toMatch(/Write/);
    expect(validateBugComment("x".repeat(BUG_COMMENT_MAX + 1))).toMatch(/under/);
  });
});
