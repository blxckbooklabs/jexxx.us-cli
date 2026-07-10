import React from "react";
import { Box, Text } from "@sauerapple/dye";
import type { SlashSuggestion } from "../slash/autocomplete.js";

const PINK = "#ec4899";
const TEXT = "#f5f5f5";
const TEXT_MUTED = "#a3a3a3";
const BG_ELEVATED = "#111111";

interface SlashPopupProps {
  suggestions: SlashSuggestion[];
  selectedIndex: number;
  visible: boolean;
}

const MAX_HEIGHT = 11;
const VISIBLE_SUGGESTIONS = 8;

const DESCRIPTION_MAX = 45;

function sanitizeDesc(text: string): string {
  return text
    .replace(/\u2014/g, "--")
    .replace(/\u2013/g, "-")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .trim();
}

export const SlashPopup: React.FC<SlashPopupProps> = ({
  suggestions,
  selectedIndex,
  visible,
}) => {
  if (!visible || suggestions.length === 0) return null;

  const scrollOffsetRef = React.useRef(0);
  if (suggestions.length <= VISIBLE_SUGGESTIONS) {
    scrollOffsetRef.current = 0;
  } else {
    const maxOffset = suggestions.length - VISIBLE_SUGGESTIONS;
    if (selectedIndex < scrollOffsetRef.current) {
      scrollOffsetRef.current = selectedIndex;
    } else if (selectedIndex >= scrollOffsetRef.current + VISIBLE_SUGGESTIONS) {
      scrollOffsetRef.current = selectedIndex - VISIBLE_SUGGESTIONS + 1;
    }
    scrollOffsetRef.current = Math.max(
      0,
      Math.min(scrollOffsetRef.current, maxOffset),
    );
  }
  const scrollOffset = scrollOffsetRef.current;

  const shown = suggestions.slice(
    scrollOffset,
    scrollOffset + VISIBLE_SUGGESTIONS,
  );
  const height = Math.min(shown.length + 3, MAX_HEIGHT);

  return (
    <Box
      position="absolute"
      bottom={4}
      left={1}
      width="68%"
      height={height}
      borderStyle="round"
      borderColor={PINK}
      backgroundColor={BG_ELEVATED}
      flexDirection="column"
    >
      <Text color={PINK}> /commands </Text>
      {shown.map((s, i) => {
        const actualIndex = scrollOffset + i;
        const isSel = actualIndex === selectedIndex;
        const clean = sanitizeDesc(s.description);
        const desc =
          clean.length > DESCRIPTION_MAX
            ? `${clean.slice(0, DESCRIPTION_MAX - 3)}...`
            : clean;
        return (
          <Box
            key={s.value}
            width="100%"
            backgroundColor={isSel ? PINK : undefined}
            height={1}
          >
            <Text bold={isSel} color={isSel ? BG_ELEVATED : TEXT}>
              {" "}
              {s.label}{" "}
            </Text>
            <Text color={isSel ? BG_ELEVATED : TEXT_MUTED}>{desc}</Text>
          </Box>
        );
      })}
    </Box>
  );
};
