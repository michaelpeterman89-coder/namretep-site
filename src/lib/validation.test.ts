import { describe, expect, it } from "vitest";
import { safeRedirectPath, validateEmail, validatePassword, validateUsername } from "./validation";

describe("validateUsername", () => {
  it.each(["abc", "Star_Pilot_99", "a".repeat(20)])("accepts %s", (name) => {
    expect(validateUsername(name)).toBeNull();
  });

  it.each(["ab", "a".repeat(21), "has space", "emoji🚀", "dash-name"])("rejects %s", (name) => {
    expect(validateUsername(name)).not.toBeNull();
  });
});

describe("validatePassword", () => {
  it("requires at least 8 characters", () => {
    expect(validatePassword("1234567")).not.toBeNull();
    expect(validatePassword("12345678")).toBeNull();
  });
});

describe("validateEmail", () => {
  it("accepts a normal address and rejects junk", () => {
    expect(validateEmail("pilot@example.com")).toBeNull();
    expect(validateEmail("not-an-email")).not.toBeNull();
  });
});

describe("safeRedirectPath", () => {
  it("allows paths on this site", () => {
    expect(safeRedirectPath("/profile")).toBe("/profile");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", null, undefined, 42])(
    "falls back for %s",
    (value) => {
      expect(safeRedirectPath(value)).toBe("/profile");
    },
  );
});
