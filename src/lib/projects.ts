// Every Namretep project, listed once. The home page and the account page show
// these automatically, so adding a project starts here (see CLAUDE.md).

export type Project = {
  key: string;
  name: string;
  /** Where the project lives, e.g. "/casino". */
  path: string;
  tagline: string;
  /** "live" projects are linked; "soon" ones show as on the way. */
  status: "live" | "soon";
  /** Its color for text and card borders (literal classes so Tailwind sees them). */
  text: string;
  border: string;
  /** The project's own page for a signed-in player (stats, balance), shown on the account page. */
  accountPath?: string;
  accountNote?: string;
};

export const PROJECTS: Project[] = [
  {
    key: "casino",
    name: "Casino",
    path: "/casino",
    tagline: "Blackjack, Texas Hold'em, craps, and baccarat with tables you set up yourself. Virtual chips only.",
    status: "live",
    text: "text-neon-magenta",
    border: "border-neon-magenta hover:bg-neon-magenta/10",
    accountPath: "/casino/profile",
    accountNote: "Your chips, daily refill, and stats for every game.",
  },
  {
    key: "studio",
    name: "Star Studio",
    path: "/studio",
    tagline: "A gallery of wacky, beautiful, interactive experiments that run right in your browser.",
    status: "live",
    text: "text-neon-lime",
    border: "border-neon-lime hover:bg-neon-lime/10",
  },
];
