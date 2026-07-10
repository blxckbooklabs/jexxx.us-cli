import React from "react";
import { Box, Text } from "@sauerapple/dye";
import { glitchNoise } from "../theme.js";

const PINK = "#ec4899";
const TEXT_MUTED = "#a3a3a3";
const BG = "#050505";

interface StatusBarProps {
  message: string;
  messageFocus?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  message,
  messageFocus,
}) => {
  const noise = glitchNoise(4, message.length);

  return (
    <Box height={1} backgroundColor={BG}>
      <Text color={TEXT_MUTED}>
        {messageFocus ? (
          <Text bold color={PINK}>
            ▓ FOCUS ▓{" "}
          </Text>
        ) : null}
        ░ {message} <Text color={PINK}>{noise}</Text>
      </Text>
    </Box>
  );
};
