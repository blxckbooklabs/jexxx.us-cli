import type blessed from "blessed";

import {
  getTokenExpiryMinutes,
  loadCredentials,
  type Credentials,
} from "../../../auth.js";
import type { AuthTuiActions } from "../auth-tui.js";
import { createPickerOverlay, type PickerItem } from "./picker-overlay.js";

export interface AuthPickerOverlayHandle {
  open: () => void;
  close: () => void;
  isVisible: () => boolean;
}

export interface AuthPickerOverlayOptions {
  authActions: AuthTuiActions;
  onMessage: (message: string) => void;
  onFocusInput: () => void;
}

function truncateEmail(email: string): string {
  return email.length > 36 ? `${email.slice(0, 33)}…` : email;
}

function formatTokenExpiry(creds: Credentials): string {
  const minutes = getTokenExpiryMinutes(creds);
  if (minutes < 0) return "EXPIRED";
  if (minutes < 5) return `${Math.floor(minutes)}m remaining (refresh soon)`;
  return `${Math.floor(minutes)}m remaining`;
}

function formatStatusHeader(creds: Credentials | null): string {
  if (!creds) {
    return [
      "{#67e8f9-fg}JEXXXUS account:{/} not signed in",
      "{gray-fg}Provider profile is separate from account auth{/}",
      "{gray-fg}Gateway: secure.jexxx.us (device authorization){/}",
    ].join("\n");
  }

  return [
    `{#67e8f9-fg}Signed in as:{/} ${truncateEmail(creds.email)}`,
    `{gray-fg}Token: ${formatTokenExpiry(creds)} · User ${creds.userId.slice(0, 8)}…{/}`,
    `{gray-fg}Gateway: secure.jexxx.us{/}`,
  ].join("\n");
}

function buildAuthPickerItems(creds: Credentials | null): PickerItem[] {
  if (!creds) {
    return [
      {
        id: "login",
        label: "Sign in",
        description: "Device authorization — same as jexxxus auth login",
      },
      {
        id: "continue",
        label: "Continue without account",
        description: "Keep chatting with your provider profile only",
      },
    ];
  }

  return [
    {
      id: "continue",
      label: "Continue",
      description: "Return to chat with current session",
    },
    {
      id: "refresh",
      label: "Refresh token",
      description: `Renew JWT via secure.jexxx.us · ${formatTokenExpiry(creds)}`,
    },
    {
      id: "reauth",
      label: "Re-authenticate",
      description: "Run a fresh device consent flow",
    },
    {
      id: "logout",
      label: "Sign out",
      description: "Revoke CLI access and delete stored credentials",
    },
  ];
}

export function createAuthPickerOverlay(
  screen: blessed.Widgets.Screen,
  opts: AuthPickerOverlayOptions,
): AuthPickerOverlayHandle {
  const picker = createPickerOverlay(screen);

  picker.setOnPick((item) => {
    void (async () => {
      switch (item.id) {
        case "continue":
          break;
        case "login":
        case "reauth": {
          for (const msg of await opts.authActions.login()) {
            opts.onMessage(msg);
          }
          break;
        }
        case "refresh": {
          for (const msg of await opts.authActions.refresh()) {
            opts.onMessage(msg);
          }
          break;
        }
        case "logout": {
          for (const msg of await opts.authActions.logout()) {
            opts.onMessage(msg);
          }
          break;
        }
        default:
          break;
      }
      opts.onFocusInput();
    })();
  });

  picker.setOnCancel(() => {
    opts.onFocusInput();
  });

  return {
    open() {
      const creds = loadCredentials({ quiet: true });
      picker.open(buildAuthPickerItems(creds), {
        title: "░ JEXXXUS account ░",
        selectedIndex: 0,
        hideFilter: true,
        statusHeader: formatStatusHeader(creds),
      });
    },
    close() {
      picker.close();
    },
    isVisible() {
      return picker.isVisible();
    },
  };
}