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
  const response = await runAgent(provider, tools, "please echo hello");
  assert.match(response, /Final answer using: echoed: hello/);
});

test("runAgent short-circuits when the model repeats an identical tool call", async () => {
  const provider = makeLoopingProvider();
  const tools = [makeEchoTool()];
  const response = await runAgent(provider, tools, "please echo stuck");
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
  const response = await runAgent(provider, [makeEchoTool()], "call a bad tool");
  assert.equal(response, "done");
});
