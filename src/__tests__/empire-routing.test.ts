import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COMPANION_VERSE_SETS,
  formatEmpireRoutingHint,
  planEmpireTools,
  type RoutableTool,
} from "../lib/blxckchat/empire-routing.js";

function expectTools(
  prompt: string,
  opts: {
    include: RoutableTool[];
    exclude?: RoutableTool[];
    slashHints?: string[];
    companionVerses?: string[];
  },
): void {
  const plan = planEmpireTools(prompt);
  for (const tool of opts.include) {
    assert.ok(
      plan.tools.includes(tool),
      `Expected ${tool} in [${plan.tools.join(", ")}] for: ${prompt}`,
    );
  }
  for (const tool of opts.exclude ?? []) {
    assert.ok(
      !plan.tools.includes(tool),
      `Expected ${tool} absent from [${plan.tools.join(", ")}] for: ${prompt}`,
    );
  }
  for (const hint of opts.slashHints ?? []) {
    assert.ok(
      plan.slashHints.some((h) => h.includes(hint)),
      `Expected slash hint containing "${hint}" for: ${prompt}`,
    );
  }
  for (const verse of opts.companionVerses ?? []) {
    assert.ok(
      plan.companionVerses.includes(verse),
      `Expected companion verse "${verse}" in [${plan.companionVerses.join(", ")}] for: ${prompt}`,
    );
  }
}

test("regression 1: Forgive Me Father videos → tv_query + companion scripture", () => {
  expectTools("Forgive Me Father videos", {
    include: ["tv_query", "bible_query"],
    companionVerses: ["1 John 1:9", "Luke 23:34"],
  });
});

test("regression 1b: Forgive Me, father? → series routing with punctuation", () => {
  const plan = planEmpireTools("Forgive Me, father?");
  assert.ok(plan.tools.includes("tv_query"));
  assert.ok(plan.tools.includes("bible_query"));
  assert.equal(plan.tvSearchQuery, "Forgive Me Father");
  assert.ok(plan.companionVerses.includes("1 John 1:9"));
});

test("regression 2: 1 John 1:9 → bible_query only", () => {
  expectTools("1 John 1:9", {
    include: ["bible_query"],
    exclude: ["tv_query", "veil_query"],
  });
});

test("regression 3: scripture and watch → tv_query + bible_query + companions", () => {
  expectTools("Forgive me — scripture and something to watch", {
    include: ["tv_query", "bible_query"],
    companionVerses: ["1 John 1:9"],
  });
});

test("regression 4: Pastor's wife read and watch → veil + tv + bible companions", () => {
  expectTools("Pastor's wife — read and watch", {
    include: ["veil_query", "tv_query", "bible_query"],
    companionVerses: ["1 Timothy 3:2"],
  });
});

test("regression 5: Jezebel → veil_query + bible companions + divinities", () => {
  expectTools("Jezebel", {
    include: ["veil_query", "bible_query"],
    slashHints: ["/divinities"],
    companionVerses: ["1 Kings 21:25"],
  });
});

test("regression 6: Nuns category on TV → tv_query + church companions", () => {
  expectTools("Nuns category on TV", {
    include: ["tv_query", "bible_query"],
    companionVerses: ["1 Corinthians 6:19"],
  });
});

test("regression 7: Corruption articles on VEIL → veil_query + confession companions", () => {
  expectTools("Corruption articles on VEIL", {
    include: ["veil_query", "bible_query"],
    companionVerses: ["1 John 1:9", "James 5:16"],
  });
});

test("regression 8: Is the database up → run_doctor", () => {
  expectTools("Is the database up?", {
    include: ["run_doctor"],
    exclude: ["tv_query", "veil_query", "bible_query"],
  });
});

test("regression 9: Latest VEIL and TV → both catalogs without scripture", () => {
  expectTools("Latest VEIL and TV", {
    include: ["veil_query", "tv_query"],
    exclude: ["bible_query"],
  });
});

test("formatEmpireRoutingHint lists companion bible_query refs", () => {
  const hint = formatEmpireRoutingHint("Forgive Me Father videos");
  assert.ok(hint);
  assert.match(hint!, /tv_query/);
  assert.match(hint!, /action=search/);
  assert.match(hint!, /Forgive Me Father/);
  assert.match(hint!, /bible_query/);
  assert.match(hint!, /1 John 1:9/);
  assert.match(hint!, /Do not pass series titles/);
  assert.doesNotMatch(hint!, /Avoid tools: bible_query/);
});

test("formatEmpireRoutingHint returns null for unrelated prompts", () => {
  assert.equal(formatEmpireRoutingHint("hello there"), null);
});

test("COMPANION_VERSE_SETS forgiveness includes confession verse", () => {
  assert.ok(COMPANION_VERSE_SETS.forgiveness.includes("1 John 1:9"));
});

test("regression 10: short follow-up routes via conversation context (Proverbs 31)", () => {
  const plan = planEmpireTools("keep going", {
    conversationContext:
      "Lil' Bible: the blonde with the Proverbs 31 bookmark. Hannah: read the draft on the way to her car.",
  });
  assert.ok(plan.tools.includes("veil_query"));
  assert.ok(plan.tools.includes("bible_query"));
  assert.ok(plan.companionVerses.some((v) => v.startsWith("Proverbs 31")));
  assert.equal(plan.veilSearchQuery, "Proverbs 31");
});

test("regression 13: multi-persona roleplay lists all named divinities", () => {
  const hint = formatEmpireRoutingHint("Roleplay Ruth, Lil' Bible, and Hannah.");
  assert.ok(hint);
  assert.match(hint!, /Ruth/);
  assert.match(hint!, /Lil' Bible/);
  assert.match(hint!, /Hannah/);
  assert.match(hint!, /equal depth/i);
});

test("regression 12: Rachel church girls routes VEIL + Genesis companions", () => {
  const plan = planEmpireTools("church girls who still think they're Rachels", {
    conversationContext: "leads her toward the vestry door",
  });
  assert.ok(plan.tools.includes("veil_query"));
  assert.ok(plan.tools.includes("bible_query"));
  assert.ok(plan.companionVerses.includes("Genesis 29:17"));
});

test("regression 11: blueprint corruption beat triggers VEIL search", () => {
  const plan = planEmpireTools("understanding is a blueprint", {
    conversationContext: "Hannah: Corruption Correspondent · Lil' Bible",
  });
  assert.ok(plan.tools.includes("veil_query"));
  assert.equal(plan.veilSearchQuery, "corruption");
});