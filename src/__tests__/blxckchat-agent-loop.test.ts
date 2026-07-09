import assert from "node:assert/strict";
import { test } from "node:test";

import { runAgent } from "../lib/blxckchat/agent-loop.js";
import type { ChatMessage, ChatResult, Provider, ToolDefinition } from "../lib/blxckchat/providers/types.js";
import type { BlxckchatTool } from "../lib/blxckchat/tools/types.js";

function makeEchoTool(): BlxckchatTool {
  return {
    name: "echo_tool",
    description: "Echoes back its input",
    parameters: { type: "object", properties: { text: { type: "string" } } },
    requiresConfirmation: false,
    async execute(args) {
      return `echoed: ${String(args.text)}`;
    },
  };
}

/** Fake provider: calls the tool once, then returns a final answer using the tool result. */
function makeSingleToolCallProvider(): Provider {
  let callCount = 0;
  return {
    id: "anthropic",
    async chat(messages: ChatMessage[], _tools: ToolDefinition[]): Promise<ChatResult> {
      callCount++;
      if (callCount === 1) {
        return {
          message: { role: "assistant", content: "" },
          toolCalls: [{ id: "call_1", name: "echo_tool", arguments: { text: "hello" } }],
          stopReason: "tool_calls",
        };
      }
      const toolMessage = messages.find((m) => m.role === "tool");
      return {
        message: { role: "assistant", content: `Final answer using: ${toolMessage?.content}` },
        toolCalls: [],
        stopReason: "stop",
      };
    },
  };
}

/** Fake provider that keeps calling the same tool with identical args (simulates a weak local model). */
function makeLoopingProvider(): Provider {
  return {
    id: "ollama",
    async chat(): Promise<ChatResult> {
      return {
        message: { role: "assistant", content: "" },
        toolCalls: [{ id: "call_x", name: "echo_tool", arguments: { text: "stuck" } }],
        stopReason: "tool_calls",
      };
    },
  };
}

test("runAgent executes a tool call and returns the model's final answer", async () => {
  const provider = makeSingleToolCallProvider();
  const tools = [makeEchoTool()];
  const { response } = await runAgent(provider, tools, "please echo hello");
  assert.match(response, /Final answer using: echoed: hello/);
});

test("runAgent short-circuits when the model repeats an identical tool call", async () => {
  const provider = makeLoopingProvider();
  const tools = [makeEchoTool()];
  const { response } = await runAgent(provider, tools, "please echo stuck");
  assert.match(response, /echoed: stuck/);
});

test("runAgent reports an error for an unrecognized tool name", async () => {
  const provider: Provider = {
    id: "anthropic",
    async chat(messages: ChatMessage[]): Promise<ChatResult> {
      const alreadyToldItsUnknown = messages.some(
        (m) => m.role === "tool" && m.content.includes("unknown tool")
      );
      if (alreadyToldItsUnknown) {
        return { message: { role: "assistant", content: "done" }, toolCalls: [], stopReason: "stop" };
      }
      return {
        message: { role: "assistant", content: "" },
        toolCalls: [{ id: "call_y", name: "nonexistent_tool", arguments: {} }],
        stopReason: "tool_calls",
      };
    },
  };
  const { response } = await runAgent(provider, [makeEchoTool()], "call a bad tool");
  assert.equal(response, "done");
});

test("runAgent returns history that a follow-up call can use for context", async () => {
  const provider = makeSingleToolCallProvider();
  const tools = [makeEchoTool()];
  const first = await runAgent(provider, tools, "please echo hello");
  assert.ok(first.history.length > 0, "history should include the first turn's messages");
  assert.equal(first.history[0]?.role, "user");
  assert.equal(first.history[0]?.content, "please echo hello");

  const last = first.history[first.history.length - 1];
  assert.equal(last?.role, "assistant");
  assert.match(last?.content ?? "", /Final answer using: echoed: hello/);
});

test("runAgent continues after chatStream returns tool_calls and streams the final answer", async () => {
  let callCount = 0;
  const provider: Provider = {
    id: "openrouter",
    async chat(): Promise<ChatResult> {
      throw new Error("chat should not be used when chatStream handles tool calls");
    },
    async chatStream(_messages, _tools, onChunk): Promise<ChatResult> {
      callCount++;
      if (callCount === 1) {
        onChunk("Let me check the scripture.");
        return {
          message: { role: "assistant", content: "Let me check the scripture." },
          toolCalls: [{ id: "call_1", name: "echo_tool", arguments: { text: "hello" } }],
          stopReason: "tool_calls",
        };
      }
      onChunk("I am Hannah.");
      return {
        message: { role: "assistant", content: "I am Hannah." },
        toolCalls: [],
        stopReason: "stop",
      };
    },
  };

  const chunks: string[] = [];
  const { response } = await runAgent(provider, [makeEchoTool()], "Tell me about yourself", [], {
    onStream: (chunk) => chunks.push(chunk),
  });

  assert.equal(callCount, 2);
  assert.match(response, /I am Hannah/);
  assert.match(chunks.join(""), /Let me check the scripture/);
  assert.match(chunks.join(""), /I am Hannah/);
});

test("runAgent caps replayed history so long sessions don't grow context unbounded", async () => {
  const provider: Provider = {
    id: "anthropic",
    async chat(messages: ChatMessage[]): Promise<ChatResult> {
      // Report how many non-system messages the model actually saw this turn.
      const nonSystemCount = messages.filter((m) => m.role !== "system").length;
      return {
        message: { role: "assistant", content: `saw ${nonSystemCount} messages` },
        toolCalls: [],
        stopReason: "stop",
      };
    },
  };
  const longHistory: ChatMessage[] = Array.from({ length: 100 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `turn ${i}`,
  }));
  const { response } = await runAgent(provider, [], "new question", longHistory);
  // 40 replayed history messages (trimmed from 100) + this turn's user message = 41
  assert.match(response, /saw 41 messages/);
});
