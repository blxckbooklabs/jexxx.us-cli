import React from "react";
import { Box, Text } from "@sauerapple/dye";
import { THEME } from "../theme.js";

interface SearchOverlayProps {
  query: string;
  cursorPos?: number | undefined;
  selectionStart?: number | undefined;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ query, cursorPos, selectionStart }) => {
  // If cursor/selection provided, render with cursor at exact position
  if (cursorPos != null) {
    const before = query.slice(0, cursorPos);
    const atCursor = query.slice(cursorPos, cursorPos + 1);
    const after = query.slice(cursorPos + 1);

    // Determine selection range
    const selStart = selectionStart ?? cursorPos;
    const selEnd = selectionStart != null ? (selectionStart < cursorPos ? cursorPos : selectionStart) : cursorPos;
    const hasSelection = selStart !== selEnd;

    if (!hasSelection) {
      return (
        <Box
          position="absolute"
          top={2}
          left={1}
          width="100%-2"
          height={3}
          borderStyle="round"
          borderColor={THEME.cyan}
          paddingLeft={1}
          paddingRight={1}
          flexDirection="row"
          alignItems="center"
        >
          <Text color={THEME.cyan}>/</Text>
          <Text>{before}</Text>
          <Text inverse>█</Text>
          <Text>{atCursor}{after}</Text>
        </Box>
      );
    }

    // Has selection - show selection highlight
    const selBefore = query.slice(0, selStart);
    const selText = query.slice(selStart, selEnd);
    const selAfter = query.slice(selEnd);
    return (
      <Box
        position="absolute"
        top={2}
        left={1}
        width="100%-2"
        height={3}
        borderStyle="round"
        borderColor={THEME.cyan}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        alignItems="center"
      >
        <Text color={THEME.cyan}>/</Text>
        <Text>{selBefore}</Text>
        <Text inverse>{selText}</Text>
        <Text>{selAfter}</Text>
      </Box>
    );
  }

  // Legacy rendering (cursor at end)
  return (
    <Box
      position="absolute"
      top={2}
      left={1}
      width="100%-2"
      height={3}
      borderStyle="round"
      borderColor={THEME.cyan}
      paddingLeft={1}
      paddingRight={1}
      flexDirection="row"
      alignItems="center"
    >
      <Text color={THEME.cyan}>/</Text>
      <Text>{query}</Text>
      <Text color={THEME.textDim}>█</Text>
    </Box>
  );
};
