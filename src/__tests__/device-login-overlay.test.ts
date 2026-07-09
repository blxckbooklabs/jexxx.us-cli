import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDeviceLoginOverlayContent } from "../lib/blxckchat/ui/components/device-login-overlay.js";

test("formatDeviceLoginOverlayContent includes code and copy hint", () => {
  const text = formatDeviceLoginOverlayContent({
    userCode: "ABCD1234",
    verificationUrl: "https://secure.jexxx.us/auth/cli",
    expiresMinutes: 14,
    status: "Waiting for authorization",
    browserOpened: true,
    copyHint: "{#67e8f9-fg}Code copied — paste in browser{/}",
  });
  assert.match(text, /ABCD1234/);
  assert.match(text, /Code copied/);
  assert.match(text, /C copy code/);
});