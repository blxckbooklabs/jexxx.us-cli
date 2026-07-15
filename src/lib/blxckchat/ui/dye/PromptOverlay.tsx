import React from "react";
import { Box, Text } from "@sauerapple/dye";
import type { PromptOverlayOptions } from "./dye-types.js";
import { THEME } from "../theme.js";
import { OverlayCenter } from "./OverlayCenter.js";

export interface PromptDisplayState {
  options: PromptOverlayOptions;
  input: string;
  /** 0-based cursor position within input. Defaults to input.length. */
  cursorPos?: number;
  /** Start of selection in input (<= cursorPos). Undefined = no selection. */
  selectionStart?: number | undefined;
}

interface PromptOverlayProps {
  state: PromptDisplayState | null;
}

export const PromptOverlay: React.FC<PromptOverlayProps> = ({ state }) => {
  if (!state) return null;

  const masked = state.options.secret ?? false;
  const cursorPos = state.cursorPos ?? state.input.length;
  const selectionStart = state.selectionStart ?? null;
  const hasValue = state.input.length > 0;

  // For secret mode, show dots with cursor at end only
  if (masked) {
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
          {state.options.hint ? (
            <Box height={1} paddingLeft={1} paddingRight={1}>
              <Text color={THEME.textDim}>{state.options.hint}</Text>
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
              •{state.input.length > 0 ? <Text color={THEME.pink}>█</Text> : null}
            </Text>
          </Box>
          <Box paddingLeft={1} paddingRight={1}>
            <Text color={THEME.textDim}>
              ⌘V or P paste · Enter confirm · Esc cancel
            </Text>
          </Box>
        </Box>
      </OverlayCenter>
    );
  }

  // Non-secret: render with cursor/selection support
  const selStart = selectionStart ?? cursorPos;
  const selEnd = selectionStart != null ? (selectionStart < cursorPos ? cursorPos : selectionStart) : cursorPos;
  const hasSelection = selStart !== selEnd;

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
        {state.options.hint ? (
          <Box height={1} paddingLeft={1} paddingRight={1}>
            <Text color={THEME.textDim}>{state.options.hint}</Text>
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
            {state.input.length === 0 ? (
              <Text color={THEME.textDim}>type here</Text>
            ) : hasSelection ? (
              <>
                <Text color={THEME.text}>{state.input.slice(0, selStart)}</Text>
                <Text inverse color={THEME.pink}>{state.input.slice(selStart, selEnd)}</Text>
                <Text color={THEME.text}>{state.input.slice(selEnd, cursorPos)}</Text>
                <Text inverse>█</Text>
                <Text color={THEME.text}>{state.input.slice(cursorPos)}</Text>
              </>
            ) : (
              <>
                <Text color={THEME.text}>{state.input.slice(0, cursorPos)}</Text>
                <Text inverse>█</Text>
                <Text color={THEME.text}>{state.input.slice(cursorPos)}</Text>
              </>
            )}
          </Text>
        </Box>
        <Box paddingLeft={1} paddingRight={1}>
          <Text color={THEME.textDim}>Enter confirm · Esc cancel</Text>
        </Box>
      </Box>
    </OverlayCenter>
  );
};
