import assert from "node:assert/strict";
import { test } from "node:test";

import {
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
}

test("regression 1: Forgive Me Father videos → tv_query only", () => {
  expectTools("Forgive Me Father videos", {
    include: ["tv_query"],
    exclude: ["bible_query"],
  });
});

test("regression 2: 1 John 1:9 → bible_query only", () => {
  expectTools("1 John 1:9", {
    include: ["bible_query"],
    exclude: ["tv_query", "veil_query"],
  });
});

test("regression 3: scripture and watch → tv_query + bible_query", () => {
  expectTools("Forgive me — scripture and something to watch", {
    include: ["tv_query", "bible_query"],
  });
});

test("regression 4: Pastor's wife read and watch → veil_query + tv_query", () => {
  expectTools("Pastor's wife — read and watch", {
    include: ["veil_query", "tv_query"],
    exclude: ["bible_query"],
  });
});

test("regression 5: Jezebel → veil_query + divinities hint, not bible", () => {
  expectTools("Jezebel", {
    include: ["veil_query"],
    exclude: ["bible_query"],
    slashHints: ["/divinities"],
  });
});

test("regression 6: Nuns category on TV → tv_query", () => {
  expectTools("Nuns category on TV", {
    include: ["tv_query"],
    exclude: ["bible_query"],
  });
});

test("regression 7: Corruption articles on VEIL → veil_query", () => {
  expectTools("Corruption articles on VEIL", {
    include: ["veil_query"],
    exclude: ["bible_query"],
  });
});

test("regression 8: Is the database up → run_doctor", () => {
  expectTools("Is the database up?", {
    include: ["run_doctor"],
    exclude: ["tv_query", "veil_query", "bible_query"],
  });
});

test("regression 9: Latest VEIL and TV → both catalogs", () => {
  expectTools("Latest VEIL and TV", {
    include: ["veil_query", "tv_query"],
    exclude: ["bible_query"],
  });
});

test("formatEmpireRoutingHint returns block when tools match", () => {
  const hint = formatEmpireRoutingHint("Forgive Me Father videos");
  assert.ok(hint);
  assert.match(hint!, /tv_query/);
  assert.match(hint!, /Avoid tools: bible_query/);
});

test("formatEmpireRoutingHint returns null for unrelated prompts", () => {
  assert.equal(formatEmpireRoutingHint("hello there"), null);
});