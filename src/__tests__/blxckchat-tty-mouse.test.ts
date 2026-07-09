import assert from "node:assert/strict";
import { test, afterEach } from "node:test";

import {
  isBlessedMouseEnabled,
  isSlashPopupMouseEnabled,
} from "../lib/blxckchat/ui/tty.js";

const prior = process.env.BLXCKCHAT_MOUSE;

afterEach(() => {
  if (prior === undefined) delete process.env.BLXCKCHAT_MOUSE;
  else process.env.BLXCKCHAT_MOUSE = prior;
});

test("isSlashPopupMouseEnabled defaults to true", () => {
  delete process.env.BLXCKCHAT_MOUSE;
  assert.equal(isSlashPopupMouseEnabled(), true);
  assert.equal(isBlessedMouseEnabled(), false);
});

test("BLXCKCHAT_MOUSE=0 disables slash popup mouse", () => {
  process.env.BLXCKCHAT_MOUSE = "0";
  assert.equal(isSlashPopupMouseEnabled(), false);
});

test("BLXCKCHAT_MOUSE=1 enables global blessed mouse", () => {
  process.env.BLXCKCHAT_MOUSE = "1";
  assert.equal(isBlessedMouseEnabled(), true);
  assert.equal(isSlashPopupMouseEnabled(), true);
});