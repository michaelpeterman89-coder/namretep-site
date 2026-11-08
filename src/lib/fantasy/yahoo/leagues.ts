import { YahooError } from "./errors";

/** Only these fields are kept from Yahoo's response. */
export type YahooLeague = {
  leagueKey: string;
  name: string;
  season: string;
  gameCode: string;
  /** e.g. "head", "headpoint", "roto". */
  scoringType: string;
  numTeams: number;
};

const LEAGUE_KEY = /^\d+\.l\.\d+$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function toLeague(raw: Record<string, unknown>): YahooLeague | null {
  const { league_key, name, season, game_code, scoring_type, num_teams } = raw;
  if (typeof league_key !== "string" || !LEAGUE_KEY.test(league_key)) return null;
  return {
    leagueKey: league_key,
    name: String(name ?? "Unnamed league"),
    season: String(season ?? ""),
    gameCode: String(game_code ?? ""),
    scoringType: String(scoring_type ?? ""),
    numTeams: Number(num_teams) || 0,
  };
}

/**
 * Yahoo's JSON is converted from XML, so a league can be buried under numbered
 * keys, and its fields can be one object or a list of one-field objects. Search
 * for leagues instead of relying on one exact shape.
 */
function collectLeagues(value: unknown, found: Map<string, YahooLeague>) {
  if (Array.isArray(value)) {
    const fields = value.filter(isObject);
    const league = toLeague(Object.assign({}, ...fields));
    if (league) {
      found.set(league.leagueKey, league);
      return;
    }
    for (const item of value) collectLeagues(item, found);
  } else if (isObject(value)) {
    const league = toLeague(value);
    if (league) {
      found.set(league.leagueKey, league);
      return;
    }
    for (const item of Object.values(value)) collectLeagues(item, found);
  }
}

/** The leagues in a /users;use_login=1/games/leagues response, newest season first. */
export function parseLeagues(body: unknown): YahooLeague[] {
  if (!isObject(body) || !("fantasy_content" in body)) {
    throw new YahooError("bad_response", "The response has no fantasy_content");
  }
  const found = new Map<string, YahooLeague>();
  collectLeagues(body.fantasy_content, found);
  return [...found.values()].sort((a, b) => b.season.localeCompare(a.season) || a.name.localeCompare(b.name));
}
