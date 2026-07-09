import assert from "node:assert/strict";
import { test } from "node:test";

import { runAgent } from "../lib/blxckchat/agent-loop.js";
import type { ChatMessage, ChatResult, Provider } from "../lib/blxckchat/providers/types.js";
import type { BlxckchatTool } from "../lib/blxckchat/tools/types.js";
import {
  addUserMessage,
  addAssistantMessage,
  createSession,
  exportSessionToFile,
} from "../lib/blxckchat/ui/session/session-store.js";
import { formatToolLine } from "../lib/blxckchat/ui/components/tool-box.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

function makeStreamingProvider(response: string): Provider {
  return {
    id: "openai",
    async chat(): Promise<ChatResult> {
      return {
        message: { role: "assistant", content: response },
        toolCalls: [],
        stopReason: "stop",
      };
    },
    async chatStream(_messages, _tools, callbacks): Promise<ChatResult> {
      const onChunk = typeof callbacks === "function" ? callbacks : callbacks.onChunk;
      for (const ch of response) {
        onChunk(ch);
      }
      return {
        message: { role: "assistant", content: response },
        toolCalls: [],
        stopReason: "stop",
      };
    },
  };
}

test("session store tracks messages and exports JSON", () => {
  const session = createSession();
  addUserMessage(session, "hi");
  addAssistantMessage(session, "hello");
  assert.equal(session.messages.length, 2);

  const tmp = path.join(os.tmpdir(), `blxckchat-session-${Date.now()}.json`);
  exportSessionToFile(session, tmp);
  const parsed = JSON.parse(fs.readFileSync(tmp, "utf-8")) as {
    messages: { role: string }[];
  };
  assert.equal(parsed.messages.length, 2);
  fs.unlinkSync(tmp);
});

test("formatToolLine color-codes pending, success, and error", () => {
  assert.match(formatToolLine("run_shell", "Running...", "pending"), /facc15-fg/);
  assert.match(formatToolLine("import_contacts", "42 imported", "success"), /4ade80-fg/);
  assert.match(formatToolLine("run_shell", "blocked", "blocked"), /f87171-fg/);
});

test("runAgent onStream callback receives streamed tokens", async () => {
  const chunks: string[] = [];
  const provider = makeStreamingProvider("streamed reply");
  const tools: BlxckchatTool[] = [];

  const { response, history } = await runAgent(
    provider,
    tools,
    "test prompt",
    [] as ChatMessage[],
    { onStream: (c) => chunks.push(c) },
  );

  assert.equal(response, "streamed reply");
  assert.equal(chunks.join(""), "streamed reply");
  assert.equal(history.length, 2);
  assert.equal(history[0]?.role, "user");
  assert.equal(history[1]?.role, "assistant");
});

test("runAgent onToolComplete fires for tool execution", async () => {
  const tool: BlxckchatTool = {
    name: "echo_tool",
    description: "echo",
    parameters: { type: "object", properties: {} },
    requiresConfirmation: false,
    async execute() {
      return "ok result";
    },
  };

  let callCount = 0;
  const provider: Provider = {
    id: "anthropic",
    async chat(messages: ChatMessage[]): Promise<ChatResult> {
      callCount++;
      if (callCount === 1) {
        return {
          message: { role: "assistant", content: "" },
          toolCalls: [{ id: "c1", name: "echo_tool", arguments: {} }],
          stopReason: "tool_calls",
        };
      }
      return {
        message: { role: "assistant", content: "done" },
        toolCalls: [],
        stopReason: "stop",
      };
    },
  };

  const events: Array<{ name: string; status: string }> = [];
  await runAgent(provider, [tool], "go", [], {
    onToolStart: (name) => events.push({ name, status: "start" }),
    onToolComplete: (name, _result, status) =>
      events.push({ name, status }),
  });

  assert.deepEqual(events, [
    { name: "echo_tool", status: "start" },
    { name: "echo_tool", status: "success" },
  ]);
});