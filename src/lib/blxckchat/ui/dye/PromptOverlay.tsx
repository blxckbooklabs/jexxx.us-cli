import React from "react";
import { Box, Text } from "@sauerapple/dye";
import type { PromptOverlayOptions } from "./dye-types.js";
import { THEME } from "../theme.js";
import { OverlayCenter } from "./OverlayCenter.js";

export interface PromptDisplayState {
  options: PromptOverlayOptions;
  input: string;
}

interface PromptOverlayProps {
  state: PromptDisplayState | null;
}

export const PromptOverlay: React.FC<PromptOverlayProps> = ({ state }) => {
  if (!state) return null;

  const masked = state.options.secret ?? false;
  const display = masked ? "•".repeat(state.input.length) : state.input;
  const hint = state.options.hint;
  const hasValue = state.input.length > 0;

  return (
    <OverlayCenter>
      <Box
        width="72%"
        height={11}
        borderStyle="round"
        borderColor={THEME.pink}
        backgroundColor={THEME.bgElevated}
        flexDirection="column"
      >
        <Text color={THEME.pink}> {state.options.title} </Text>
        <Box height={1} paddingLeft={1} paddingRight={1}>
          <Text color={THEME.textMuted}>{state.options.label}</Text>
        </Box>
        {hint ? (
          <Box height={1} paddingLeft={1} paddingRight={1}>
            <Text color={THEME.textDim}>{hint}</Text>
          </Box>
        ) : null}
        <Box
          height={3}
          borderStyle="round"
          borderColor={hasValue ? THEME.pinkGlow : THEME.textDim}
          marginTop={1}
          marginBottom={1}
          marginLeft={1}
          marginRight={1}
          paddingLeft={1}
          paddingRight={1}
        >
          <Text color={THEME.text}>
            {display || (
              <Text color={THEME.textDim}>
                {masked ? "paste secret" : "type here"}
              </Text>
            )}
            <Text color={hasValue ? THEME.pink : THEME.textDim}>█</Text>
          </Text>
        </Box>
        <Box paddingLeft={1} paddingRight={1}>
          <Text color={THEME.textDim}>
            {masked
              ? "⌘V or ⇧P paste · Enter confirm · Esc cancel"
              : "Enter confirm · Esc cancel"}
          </Text>
        </Box>
      </Box>
    </OverlayCenter>
  );
};
