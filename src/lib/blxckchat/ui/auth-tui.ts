import blessed from "blessed";

import {
  deleteCredentials,
  formatAuthStatusLines,
  loadCredentials,
  refreshAccessTokenViaServer,
  runInteractiveDeviceLogin,
  saveCredentials,
} from "../../auth.js";
import { THEME } from "./theme.js";
import { pauseBlessedForConsole } from "./tty.js";

export function promptBlessedYesNo(
  screen: blessed.Widgets.Screen,
  message: string,
): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: "80%",
      height: 8,
      border: { type: "line" },
      tags: true,
      label: " Confirm ",
      style: {
        fg: THEME.text,
        bg: THEME.bgElevated,
        border: { fg: THEME.pink },
      },
      content: [
        `{#ec4899-fg}░░ confirm ░░{/}`,
        message,
        "",
        "{#67e8f9-fg}Y{/} yes  {#f87171-fg}N{/} no",
      ].join("\n"),
    });

    const finish = (value: boolean): void => {
      modal.destroy();
      screen.render();
      resolve(value);
    };

    modal.key(["y", "Y"], () => finish(true));
    modal.key(["n", "N", "escape"], () => finish(false));
    modal.focus();
    screen.render();
  });
}

export interface AuthTuiActions {
  status: () => Promise<string[]>;
  login: () => Promise<string[]>;
  logout: () => Promise<string[]>;
  refresh: () => Promise<string[]>;
}

export interface CreateAuthTuiActionsOptions {
  screen: blessed.Widgets.Screen;
  onAuthChanged: () => void;
}

export function createAuthTuiActions(
  options: CreateAuthTuiActionsOptions,
): AuthTuiActions {
  const { screen, onAuthChanged } = options;

  let resumeBlessed: (() => void) | null = null;

  const restoreTui = (): void => {
    resumeBlessed?.();
    resumeBlessed = null;
    screen.render();
  };

  const hideTui = (): void => {
    resumeBlessed = pauseBlessedForConsole(screen);
  };

  return {
    async status() {
      return formatAuthStatusLines(loadCredentials({ quiet: true }));
    },

    async login() {
      hideTui();
      try {
        const creds = await runInteractiveDeviceLogin();
        saveCredentials(creds);
        onAuthChanged();
        return [
          `Signed in as ${creds.email}`,
          "JEXXXUS account linked via secure.jexxx.us",
        ];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return [`Login failed: ${msg}`];
      } finally {
        restoreTui();
      }
    },

    async logout() {
      const creds = loadCredentials({ quiet: true });
      if (!creds) {
        return ["Not signed in to JEXXXUS."];
      }
      const ok = await promptBlessedYesNo(
        screen,
        "Revoke CLI access and delete stored credentials?",
      );
      if (!ok) {
        return ["Logout cancelled."];
      }
      deleteCredentials();
      onAuthChanged();
      return ["Signed out. Run /auth login to connect secure.jexxx.us again."];
    },

    async refresh() {
      const creds = loadCredentials({ quiet: true });
      if (!creds) {
        return ["Not signed in. Use /auth login first."];
      }
      try {
        const refreshed = await refreshAccessTokenViaServer(creds.refreshToken);
        saveCredentials(refreshed);
        onAuthChanged();
        return [`Token refreshed for ${refreshed.email}.`];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return [`Refresh failed: ${msg}`, "Try /auth login."];
      }
    },
  };
}