// Bug report rules shared by the pages and the server. Keep the statuses and
// lengths in sync with supabase/migrations/20261108020000_bug_reports.sql.

export const BUG_STATUSES = [
  { key: "new", label: "New", badge: "border-neon-cyan text-neon-cyan" },
  { key: "in_progress", label: "In progress", badge: "border-neon-gold text-neon-gold" },
  { key: "planned", label: "Planned", badge: "border-neon-magenta text-neon-magenta" },
  { key: "fixed", label: "Fixed", badge: "border-neon-lime text-neon-lime" },
  { key: "expected", label: "Expected", badge: "border-starlight/70 text-starlight/80" },
  { key: "other", label: "Other", badge: "border-starlight/70 text-starlight/80" },
] as const;

export type BugStatus = (typeof BUG_STATUSES)[number]["key"];

export const BUG_TITLE_MIN = 5;
export const BUG_TITLE_MAX = 120;
export const BUG_BODY_MIN = 10;
export const BUG_BODY_MAX = 4000;
export const BUG_COMMENT_MAX = 2000;

export function isBugStatus(value: unknown): value is BugStatus {
  return BUG_STATUSES.some((s) => s.key === value);
}

export function bugStatus(key: string) {
  return BUG_STATUSES.find((s) => s.key === key) ?? BUG_STATUSES[BUG_STATUSES.length - 1];
}

/** A report number from a URL or form, or null if it isn't one. */
export function parseBugId(value: unknown): number | null {
  return typeof value === "string" && /^[1-9]\d{0,14}$/.test(value) ? Number(value) : null;
}

/** Form text with its edges trimmed and line endings made the same everywhere. */
export function cleanBugText(value: unknown): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

export function validateBugReport(title: string, body: string): string | null {
  if (title.length < BUG_TITLE_MIN || title.length > BUG_TITLE_MAX) {
    return `Give it a title between ${BUG_TITLE_MIN} and ${BUG_TITLE_MAX} characters.`;
  }
  if (body.length < BUG_BODY_MIN) return "Add a little more detail about what went wrong.";
  if (body.length > BUG_BODY_MAX) return `Keep the description under ${BUG_BODY_MAX.toLocaleString("en-US")} characters.`;
  return null;
}

export function validateBugComment(body: string): string | null {
  if (!body) return "Write something first.";
  if (body.length > BUG_COMMENT_MAX) return `Keep it under ${BUG_COMMENT_MAX.toLocaleString("en-US")} characters.`;
  return null;
}
