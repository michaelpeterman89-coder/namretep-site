import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, parseEncryptionKey } from "./token-crypto";

const key = randomBytes(32);
const USER = "524327fa-0000-4000-8000-000000000001";

describe("token encryption", () => {
  it("round-trips a token without storing it in the clear", () => {
    const stored = encryptToken("secret-token", key, USER);
    expect(stored).not.toContain("secret-token");
    expect(decryptToken(stored, key, USER)).toBe("secret-token");
  });

  it("gives a different result each time", () => {
    expect(encryptToken("secret-token", key, USER)).not.toBe(encryptToken("secret-token", key, USER));
  });

  it("refuses the wrong key", () => {
    const stored = encryptToken("secret-token", key, USER);
    expect(() => decryptToken(stored, randomBytes(32), USER)).toThrow();
  });

  it("refuses a token copied to another account", () => {
    const stored = encryptToken("secret-token", key, USER);
    expect(() => decryptToken(stored, key, "another-user")).toThrow();
  });

  it("refuses a changed value", () => {
    const parts = encryptToken("secret-token", key, USER).split(".");
    parts[3] = Buffer.from("something-else").toString("base64url");
    expect(() => decryptToken(parts.join("."), key, USER)).toThrow();
  });

  it("refuses a value in an unknown format", () => {
    expect(() => decryptToken("not-encrypted", key, USER)).toThrow("Unrecognized");
  });
});

describe("parseEncryptionKey", () => {
  it("accepts a 32-byte base64 key", () => {
    expect(parseEncryptionKey(key.toString("base64"))).toEqual(key);
  });

  it.each([undefined, "", "too-short"])("rejects %s", (value) => {
    expect(() => parseEncryptionKey(value)).toThrow("YAHOO_TOKEN_ENCRYPTION_KEY");
  });
});
