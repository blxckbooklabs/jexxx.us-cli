import React from "react";
import { Box, Text } from "@sauerapple/dye";
import { THEME } from "../theme.js";
import { OverlayCenter } from "./OverlayCenter.js";

const HOTKEYS = [
  { keys: "Ctrl+C / Ctrl+D", action: "Exit BLXCKCHAT" },
  { keys: "Esc", action: "Abort turn · close popup · exit" },
  { keys: "?", action: "Show this hotkeys overlay" },
  { keys: "/", action: "Slash command suggestions" },
  { keys: "Tab", action: "Accept slash suggestion · queue while busy" },
  { keys: "↑ / ↓", action: "Browse slash suggestions · input history" },
  { keys: "PgUp / PgDn", action: "Scroll history by half viewport" },
  { keys: "Home / End", action: "Jump to top / latest message" },
  { keys: "Ctrl+F", action: "Search messages" },
  { keys: "Ctrl+Z", action: "Suspend BLXCKCHAT" },
  { keys: "Ctrl+L", action: "Model picker" },
  { keys: "Ctrl+P", action: "Next model" },
  { keys: "Ctrl+T", action: "Toggle all thinking blocks" },
  { keys: "Space", action: "Toggle focused thinking block" },
  { keys: "Ctrl+O", action: "Copy last assistant reply" },
  { keys: "Ctrl+Y", action: "Copy full TUI snapshot" },
  { keys: "Ctrl+S", action: "Export session JSON" },
  { keys: "Ctrl+N", action: "New session" },
];

export const HotkeysOverlay: React.FC = () => {
  return (
    <OverlayCenter>
      <Box
        width="85%"
        height={22}
        borderStyle="round"
        borderColor={THEME.pink}
        backgroundColor={THEME.bgElevated}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="column"
      >
        <Text bold color={THEME.pink}>
          BLXCKCHAT keyboard shortcuts
        </Text>
        <Box height={1} />
        {HOTKEYS.map((hk) => (
          <Box key={hk.keys} flexDirection="row">
            <Text color={THEME.cyan} wrap="truncate">
              {hk.keys.padEnd(22)}
            </Text>
            <Text wrap="truncate"> {hk.action}</Text>
          </Box>
        ))}
        <Box height={1} />
        <Text color={THEME.textDim}>Press ? or Esc to close</Text>
      </Box>
    </OverlayCenter>
  );
};
