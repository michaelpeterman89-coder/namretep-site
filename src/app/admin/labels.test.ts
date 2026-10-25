import { describe, expect, it } from "vitest";
import type { AdminLogLine } from "@/server/admin";
import { describeAdminAction } from "./labels";

const line = (action: string, details: AdminLogLine["details"] = {}): AdminLogLine => ({
  id: 1,
  action,
  adminName: "Namretep",
  targetId: null,
  targetName: null,
  details,
  at: new Date(0),
});

describe("describeAdminAction", () => {
  it("describes chip adjustments with the note", () => {
    expect(describeAdminAction(line("adjust_chips", { amount: 5000, note: "prize" }))).toBe("gave 5,000 chips (prize)");
    expect(describeAdminAction(line("adjust_chips", { amount: -200, note: null }))).toBe("took 200 chips");
  });

  it("describes roles, suspensions, renames, and closed tables", () => {
    expect(describeAdminAction(line("grant_admin"))).toBe("made them an admin");
    expect(describeAdminAction(line("suspend", { note: "spam" }))).toBe("suspended the account (spam)");
    expect(describeAdminAction(line("rename", { from: "bad_name", to: "pilot_1" }))).toBe("renamed bad_name to pilot_1");
    expect(describeAdminAction(line("close_table", { name: "High rollers", game: "holdem" }))).toBe(
      "closed the Texas Hold'em table “High rollers”",
    );
  });
});
