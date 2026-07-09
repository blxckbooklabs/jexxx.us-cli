import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectGardenToolResultsSinceUser,
  needsGardenSynthesis,
  stripMetaContinuationPrompts,
} from "../lib/blxckchat/garden-synthesis.js";
import type { ChatMessage } from "../lib/blxckchat/providers/types.js";

test("stripMetaContinuationPrompts removes want-the-scene tails", () => {
  const raw =
    "She heads for the door.\n\nWant the scene to continue? I can bring the pastor's daughter in.";
  const out = stripMetaContinuationPrompts(raw);
  assert.equal(out, "She heads for the door.");
});

test("needsGardenSynthesis when bible and veil tools ignored", () => {
  const tools = [
    {
      tool: "bible_query" as const,
      result: "1 Samuel 1:10 (Masoretic)\nShe was in bitterness of soul, and prayed to Yahweh.",
    },
    {
      tool: "veil_query" as const,
      result:
        "VEIL articles (1 shown):\n\n1. Title\n   https://veil.jexxx.us/articles/sample",
    },
  ];
  const reply = "She heads for the door.\n\nBut there's always next Sunday.";
  assert.equal(needsGardenSynthesis(reply, tools), true);
});

test("needsGardenSynthesis false when verse and veil linked", () => {
  const tools = [
    {
      tool: "bible_query" as const,
      result: "1 Samuel 1:10 (Masoretic)\nShe was in bitterness of soul, and prayed to Yahweh.",
    },
    {
      tool: "veil_query" as const,
      result: "VEIL articles (1 shown):\n\nhttps://veil.jexxx.us/articles/sample",
    },
  ];
  const reply =
    "Hannah prayed bitterly — *She was in bitterness of soul* — and handed her the [Excuses](https://veil.jexxx.us/articles/sample) piece.";
  assert.equal(needsGardenSynthesis(reply, tools), false);
});

test("collectGardenToolResultsSinceUser gathers tool messages after user", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "continue" },
    { role: "assistant", content: "draft" },
    {
      role: "tool",
      toolCallId: "1",
      content: "1 Samuel 2:1 (Masoretic)\nMy heart exults in Yahweh.",
    },
  ];
  const tools = collectGardenToolResultsSinceUser(messages);
  assert.equal(tools.length, 1);
  assert.equal(tools[0]?.tool, "bible_query");
});