import React from "react";
import { Box, Text } from "@sauerapple/dye";
import { glitchNoise, crtCorner } from "../theme.js";

const PINK = "#ec4899";
const TEXT = "#f5f5f5";
const TEXT_MUTED = "#a3a3a3";
const BG = "#050505";

interface TopBarProps {
  subtitle: string;
  glitchSeed: number;
}

export const TopBar: React.FC<TopBarProps> = ({ subtitle, glitchSeed }) => {
  const noise = glitchNoise(64, glitchSeed);
  const model = subtitle.length > 40 ? `${subtitle.slice(0, 37)}…` : subtitle;

  return (
    <Box flexDirection="column" height={2} marginTop={1} backgroundColor={BG}>
      <Text bold color={TEXT}>
        <Text color={PINK}>{crtCorner("tl")} </Text>
        <Text bold color={PINK}>
          BLXCKCHAT
        </Text>
        <Text color="gray"> │ </Text>
        <Text color={TEXT_MUTED}>{model}</Text>
        <Text color={PINK}> ▮ LIVE</Text>
        <Text color={PINK}> {crtCorner("tr")}</Text>
      </Text>
      <Text color={PINK}>{noise}</Text>
    </Box>
  );
};
