import "server-only";
import type { AvatarId } from "@/lib/avatars";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendlyDbError } from "./tables";

// The leaderboard, built by one SQL function from the chip ledger and stats.
// Periods are calendar periods in US Central time (weeks start Monday).

export const PERIODS = {
  day: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
  all: "All time",
} as const;
export type Period = keyof typeof PERIODS;

export type LeaderRow = {
  id: string;
  username: string;
  avatar: AvatarId;
  /** Chips won or lost at the tables in the period (refills and admin gifts not included). */
  profit: number;
  /** Sign-up chips and daily refills received in the period. */
  fromSite: number;
  /** Net chips given (+) or taken (−) by admins in the period. */
  fromAdmins: number;
};

export type RichRow = { id: string; username: string; avatar: AvatarId; chips: number };

export type SiteTotals = {
  siteGiven: number;
  signups: number;
  refills: number;
  adminGiven: number;
  adminTaken: number;
  blackjackWagered: number;
  /** Everyone's game profit added up: negative means the house and bots are ahead. */
  playersNet: number;
  activePlayers: number;
  blackjackRounds: number;
  pokerHands: number;
  chipsInPlay: number;
};

type RecordHolder = { username: string; amount: number; game?: string } | null;
export type Records = {
  biggestWin: RecordHolder;
  biggestLoss: RecordHolder;
  mostHands: RecordHolder;
  bestOnBook: { username: string; percent: number; decisions: number } | null;
};

export type Leaderboard = {
  since: Date | null;
  players: LeaderRow[];
  richest: RichRow[];
  totals: SiteTotals;
  records: Records;
};

type Raw = {
  since: string | null;
  players: { id: string; username: string; avatar: string; profit: number; from_site: number; from_admins: number }[];
  richest: { id: string; username: string; avatar: string; chips: number }[];
  totals: { [k: string]: number };
  records: {
    biggest_win: { username: string; amount: number; game: string } | null;
    biggest_loss: { username: string; amount: number; game: string } | null;
    most_hands: { username: string; amount: number } | null;
    best_on_book: { username: string; percent: number; decisions: number } | null;
  };
};

const num = (n: unknown) => Number(n ?? 0);

export async function getLeaderboard(period: Period): Promise<Leaderboard> {
  const { data, error } = await createAdminClient().rpc("leaderboard", { p_period: period });
  if (error) throw friendlyDbError(error);
  const raw = data as unknown as Raw;
  const t = raw.totals;
  const record = (r: { username: string; amount: number; game?: string } | null): RecordHolder =>
    r && { username: r.username, amount: num(r.amount), game: r.game };

  return {
    since: raw.since ? new Date(raw.since) : null,
    players: raw.players.map((p) => ({
      id: p.id,
      username: p.username,
      avatar: p.avatar as AvatarId,
      profit: num(p.profit),
      fromSite: num(p.from_site),
      fromAdmins: num(p.from_admins),
    })),
    richest: raw.richest.map((r) => ({ id: r.id, username: r.username, avatar: r.avatar as AvatarId, chips: num(r.chips) })),
    totals: {
      siteGiven: num(t.site_given),
      signups: num(t.signups),
      refills: num(t.refills),
      adminGiven: num(t.admin_given),
      adminTaken: num(t.admin_taken),
      blackjackWagered: num(t.blackjack_wagered),
      playersNet: num(t.players_net),
      activePlayers: num(t.active_players),
      blackjackRounds: num(t.blackjack_rounds),
      pokerHands: num(t.poker_hands),
      chipsInPlay: num(t.chips_in_play),
    },
    records: {
      biggestWin: record(raw.records.biggest_win),
      biggestLoss: record(raw.records.biggest_loss),
      mostHands: record(raw.records.most_hands),
      bestOnBook: raw.records.best_on_book && {
        username: raw.records.best_on_book.username,
        percent: num(raw.records.best_on_book.percent),
        decisions: num(raw.records.best_on_book.decisions),
      },
    },
  };
}
