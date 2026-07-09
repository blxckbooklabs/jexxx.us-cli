import assert from "node:assert/strict";
import { test } from "node:test";

import { MessageQueue } from "../lib/blxckchat/ui/message-queue.js";
import {
  isBlessedMouseEnabled,
  writeTerminalResetSequences,
} from "../lib/blxckchat/ui/tty.js";
import { shouldAutosave } from "../lib/blxckchat/ui/session/autosave.js";
import { branchUndo } from "../lib/blxckchat/ui/session/branch.js";
import {
  addAssistantMessage,
  addUserMessage,
  createSession,
} from "../lib/blxckchat/ui/session/session-store.js";

test("MessageQueue enqueue ignores blank lines", () => {
  const q = new MessageQueue();
  assert.equal(q.enqueue("   "), false);
  assert.equal(q.length, 0);
});

test("MessageQueue dequeue returns FIFO order", () => {
  const q = new MessageQueue();
  q.enqueue("first");
  q.enqueue("second");
  assert.equal(q.dequeue(), "first");
  assert.equal(q.dequeue(), "second");
  assert.equal(q.dequeue(), undefined);
});

test("shouldAutosave fires every 30 messages", () => {
  assert.equal(shouldAutosave(0), false);
  assert.equal(shouldAutosave(29), false);
  assert.equal(shouldAutosave(30), true);
  assert.equal(shouldAutosave(60), true);
});

test("branchUndo removes last user/assistant exchange from session", () => {
  const session = createSession();
  addUserMessage(session, "hello");
  addAssistantMessage(session, "hi there");
  addUserMessage(session, "follow up");
  addAssistantMessage(session, "sure");

  assert.equal(branchUndo(session), true);
  assert.equal(session.messages.length, 2);
  assert.equal(session.messages[1]?.content, "hi there");
  assert.equal(session.conversationHistory.length, 0);
});

test("branchUndo returns false when session is empty", () => {
  const session = createSession();
  assert.equal(branchUndo(session), false);
});

test("isBlessedMouseEnabled is off unless BLXCKCHAT_MOUSE is set", () => {
  const prev = process.env.BLXCKCHAT_MOUSE;
  delete process.env.BLXCKCHAT_MOUSE;
  assert.equal(isBlessedMouseEnabled(), false);
  process.env.BLXCKCHAT_MOUSE = "1";
  assert.equal(isBlessedMouseEnabled(), true);
  if (prev === undefined) delete process.env.BLXCKCHAT_MOUSE;
  else process.env.BLXCKCHAT_MOUSE = prev;
});

test("writeTerminalResetSequences does not throw without a TTY", () => {
  assert.doesNotThrow(() => writeTerminalResetSequences());
});