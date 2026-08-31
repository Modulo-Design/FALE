import assert from "node:assert/strict";
import { test } from "node:test";
import { GOVERNORS, findUnmappedRosters, governorNames, resolveGovernor } from "./governors";

test("a Sleeper username resolves to its governor", () => {
  const result = resolveGovernor("2025", { rosterId: 1, username: "bbakk" });
  assert.equal(result.name, "Ben");
  assert.equal(result.resolved, true);
});

test("a second account resolves to the same person", () => {
  assert.equal(resolveGovernor("2025", { rosterId: 1, username: "bbakk" }).name, "Ben");
  assert.equal(resolveGovernor("2025", { rosterId: 2, username: "mittens7" }).name, "Ben");
  assert.equal(resolveGovernor("2020", { rosterId: 3, username: "fierst" }).name, "Mark");
  assert.equal(resolveGovernor("2020", { rosterId: 4, username: "starzofthenorth" }).name, "Mark");
});

test("TurtMoans is Mike, not a governor of its own", () => {
  // "TurtMoans" is Mike's team name. The old display_name fallback surfaced it
  // as if it were a separate person.
  assert.equal(resolveGovernor("2026", { rosterId: 1, displayName: "TurtMoans" }).name, "Mike");
  assert.equal(resolveGovernor("2026", { rosterId: 1, teamName: "TurtMoans" }).name, "Mike");
  assert.equal(resolveGovernor("2026", { rosterId: 1, username: "yank4225" }).name, "Mike");
});

test("alias matching is case-insensitive", () => {
  assert.equal(resolveGovernor("2026", { rosterId: 1, username: "YANK4225" }).name, "Mike");
  assert.equal(resolveGovernor("2026", { rosterId: 1, displayName: "turtmoans" }).name, "Mike");
});

test("username wins over a display name belonging to someone else", () => {
  const result = resolveGovernor("2025", {
    rosterId: 1,
    username: "bbakk",
    displayName: "turtmoans",
  });
  assert.equal(result.name, "Ben");
});

test("an unknown roster is reported rather than invented", () => {
  const result = resolveGovernor("2025", { rosterId: 9, displayName: "SomeNewGuy" });
  assert.equal(result.resolved, false);
  assert.match(result.name, /^Unmapped:/);
});

test("findUnmappedRosters returns only the rosters that failed to resolve", () => {
  const unmapped = findUnmappedRosters("2025", [
    { rosterId: 1, username: "bbakk" },
    { rosterId: 2, username: "who-is-this" },
  ]);
  assert.equal(unmapped.length, 1);
  assert.equal(unmapped[0].rosterId, 2);
});

test("no alias is claimed by two governors", () => {
  const seen = new Map<string, string>();
  for (const governor of GOVERNORS) {
    for (const alias of governor.aliases) {
      const key = alias.toLowerCase();
      assert.equal(
        seen.get(key) ?? governor.name,
        governor.name,
        `alias "${alias}" is shared between ${seen.get(key)} and ${governor.name}`
      );
      seen.set(key, governor.name);
    }
  }
});

test("the registry covers every governor in the league spreadsheet", () => {
  // The 14 names that appear across the 2020-2025 stats export.
  const spreadsheetGovernors = [
    "Ben", "Brent", "Chris", "DanK", "DanP", "Eli", "Jeremy",
    "Johnathan", "Josh", "Knute", "Mark", "Matt", "Peter", "Sam",
  ];
  const known = new Set(governorNames());
  for (const name of spreadsheetGovernors) {
    assert.ok(known.has(name), `${name} appears in the spreadsheet but not in the registry`);
  }
});
