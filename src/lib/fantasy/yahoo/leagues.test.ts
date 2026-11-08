import { describe, expect, it } from "vitest";
import { YahooError } from "./errors";
import { parseLeagues } from "./leagues";

const league = (key: string, name: string, season = "2026") => ({
  league_key: key,
  league_id: key.split(".l.")[1],
  name,
  url: "https://football.fantasysports.yahoo.com/f1/1000",
  num_teams: 10,
  scoring_type: "head",
  game_code: "nfl",
  season,
});

// Yahoo's JSON keeps numbered keys and a "count" from its XML.
const wrapped = (...leagues: object[]) => ({
  fantasy_content: {
    users: {
      "0": {
        user: [
          { guid: "PRIVATE-GUID" },
          {
            games: {
              "0": {
                game: [
                  { game_key: "461", code: "nfl" },
                  {
                    leagues: {
                      ...Object.fromEntries(leagues.map((l, i) => [String(i), { league: [l] }])),
                      count: leagues.length,
                    },
                  },
                ],
              },
              count: 1,
            },
          },
        ],
      },
      count: 1,
    },
  },
});

describe("parseLeagues", () => {
  it("finds a league under Yahoo's numbered keys", () => {
    expect(parseLeagues(wrapped(league("461.l.1000", "Stars")))).toEqual([
      {
        leagueKey: "461.l.1000",
        name: "Stars",
        season: "2026",
        gameCode: "nfl",
        scoringType: "head",
        numTeams: 10,
      },
    ]);
  });

  it("finds a league stored as a list of one-field objects", () => {
    const fields = Object.entries(league("461.l.1000", "Stars")).map(([k, v]) => ({ [k]: v }));
    expect(parseLeagues({ fantasy_content: { leagues: { "0": { league: fields } } } })[0]?.leagueKey).toBe("461.l.1000");
  });

  it("keeps only the fields we chose", () => {
    const [parsed] = parseLeagues(wrapped({ ...league("461.l.1000", "Stars"), email: "someone@example.com" }));
    expect(JSON.stringify(parsed)).not.toMatch(/example\.com|PRIVATE-GUID|yahoo\.com/);
  });

  it("sorts by newest season, then name", () => {
    const parsed = parseLeagues(
      wrapped(league("390.l.1", "Old", "2019"), league("461.l.2", "Zebra"), league("461.l.3", "Alpha")),
    );
    expect(parsed.map((l) => l.name)).toEqual(["Alpha", "Zebra", "Old"]);
  });

  it("ignores values that aren't real league keys", () => {
    expect(parseLeagues(wrapped(league("bad-key", "Nope")))).toEqual([]);
  });

  it("returns nothing for a user with no leagues", () => {
    expect(parseLeagues({ fantasy_content: { users: { "0": { user: [{ guid: "x" }, { games: [] }] } } } })).toEqual([]);
  });

  it.each([null, "<xml/>", {}, []])("rejects a response that isn't Yahoo's: %j", (body) => {
    expect(() => parseLeagues(body)).toThrow(YahooError);
  });
});
