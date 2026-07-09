import * as fs from "fs";

import blessed from "blessed";

import {
  getCredentialsDir,
  openDeviceAuthBrowser,
  pollDeviceAuth,
  startDeviceAuth,
  type Credentials,
} from "../../../auth.js";
import { createModalKeypress, type BlessedKey } from "../editor/modal-keypress.js";
import { releaseOverlayFocus, takeOverlayFocus } from "../editor/overlay-focus.js";
import { dismissSlashMenuBeforeOverlay } from "../menu-mutex.js";
import { copyToClipboard } from "../session/tui-snapshot.js";
import { THEME } from "../theme.js";

export class DeviceLoginCancelledError extends Error {
  constructor() {
    super("cancelled");
    this.name = "DeviceLoginCancelledError";
  }
}

export interface DeviceLoginOverlayHandle {
  run: () => Promise<Credentials>;
  cancel: () => void;
  isVisible: () => boolean;
}

export function formatDeviceLoginOverlayContent(input: {
  userCode: string;
  verificationUrl: string;
  expiresMinutes: number;
  status: string;
  browserOpened: boolean;
  copyHint: string;
}): string {
  const url = input.verificationUrl.replace(/^https?:\/\//, "");
  const browserLine = input.browserOpened
    ? "{gray-fg}Browser opened · {/}"
    : "{gray-fg}Open the URL below in your browser · {/}";
  return [
    `{#67e8f9-fg}Visit:{/} ${url}`,
    "",
    `{#f9a8d4-fg}Enter this code on the page:{/}`,
    "",
    `{#ec4899-fg}{bold}  ${input.userCode}  {/bold}{/}`,
    "",
    input.copyHint,
    "",
    `${browserLine}{gray-fg}${input.status}{/}`,
    `{gray-fg}Expires in ${input.expiresMinutes} minutes{/}`,
    "",
    `{gray-fg}C copy code · Esc cancel{/}`,
  ].join("\n");
}

function writeDeviceCodeFallback(userCode: string): string {
  const dir = getCredentialsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const path = `${dir}/device-auth-code.txt`;
  fs.writeFileSync(path, `${userCode}\n`, { encoding: "utf-8", mode: 0o600 });
  return path;
}

export function createDeviceLoginOverlay(
  screen: blessed.Widgets.Screen,
): DeviceLoginOverlayHandle {
  let visible = false;
  let cancelled = false;
  let dotTimer: ReturnType<typeof setInterval> | null = null;
  let activeUserCode = "";
  let copyHint =
    "{gray-fg}Copying code to clipboard…{/}";
  const modalKeys = createModalKeypress(screen);

  const modal = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "82%",
    height: 16,
    border: { type: "line" },
    label: " ░ device authorization ░ ",
    tags: true,
    hidden: true,
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    style: {
      fg: THEME.text,
      bg: THEME.bgElevated,
      border: { fg: THEME.pink },
    },
  });

  const render = (content: string): void => {
    modal.setContent(content);
    screen.render();
  };

  const stopDotTimer = (): void => {
    if (dotTimer) {
      clearInterval(dotTimer);
      dotTimer = null;
    }
  };

  const close = (): void => {
    stopDotTimer();
    modal.hide();
    visible = false;
    modalKeys.stop();
    releaseOverlayFocus(screen);
    screen.render();
  };

  const cancel = (): void => {
    cancelled = true;
    close();
  };

  const copyActiveCode = async (renderView: (status: string) => void, status: string): Promise<void> => {
    if (!activeUserCode) return;
    const fallbackPath = writeDeviceCodeFallback(activeUserCode);
    const copied = await copyToClipboard(activeUserCode);
    copyHint = copied
      ? "{#67e8f9-fg}Code copied — paste in browser (Cmd+V / Ctrl+V){/}"
      : `{#f87171-fg}Clipboard unavailable — code saved to ${fallbackPath}{/}`;
    renderView(status);
  };

  const handleKeypress = (_ch: string, key: BlessedKey, renderView: (status: string) => void, status: string): void => {
    if (!visible) return;
    if (key.name === "c" || key.name === "C" || key.name === "C-y" || key.name === "C-S-y") {
      void copyActiveCode(renderView, status);
      return;
    }
    if (key.name === "escape" || key.name === "C-c" || key.name === "q") {
      cancel();
    }
  };

  const waitForCancel = (): Promise<never> =>
    new Promise((_, reject) => {
      const tick = setInterval(() => {
        if (cancelled) {
          clearInterval(tick);
          reject(new DeviceLoginCancelledError());
        }
      }, 100);
    });

  return {
    isVisible() {
      return visible;
    },
    cancel,
    async run() {
      cancelled = false;
      dismissSlashMenuBeforeOverlay();

      const { userCode, codeVerifier, expiresIn, verificationUrl } =
        await startDeviceAuth();

      activeUserCode = userCode;
      copyHint = "{gray-fg}Copying code to clipboard…{/}";

      const expiresMinutes = Math.max(1, Math.floor(expiresIn / 60));
      let browserOpened = false;
      let dots = 0;
      let pollStatus = "Waiting for authorization";

      const updateView = (status: string): void => {
        pollStatus = status;
        render(
          formatDeviceLoginOverlayContent({
            userCode,
            verificationUrl,
            expiresMinutes,
            status,
            browserOpened,
            copyHint,
          }),
        );
      };

      modal.setFront();
      modal.show();
      takeOverlayFocus(screen, modal);
      modalKeys.start((ch, key) => handleKeypress(ch, key, updateView, pollStatus));
      visible = true;
      updateView("Waiting for authorization");

      await copyActiveCode(updateView, pollStatus);

      openDeviceAuthBrowser(verificationUrl);
      browserOpened = true;
      updateView(pollStatus);

      dotTimer = setInterval(() => {
        dots = (dots + 1) % 4;
        updateView(`Waiting for authorization${".".repeat(dots)}`);
      }, 600);

      try {
        const creds = await Promise.race([
          pollDeviceAuth(userCode, codeVerifier, expiresIn),
          waitForCancel(),
        ]);
        close();
        return creds;
      } catch (err) {
        close();
        throw err;
      }
    },
  };
}