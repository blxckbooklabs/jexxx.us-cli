import React from "react";
import { Box, Text } from "@sauerapple/dye";
import type { ConfirmDialogState } from "./dye-types.js";
import { THEME } from "../theme.js";
import { OverlayCenter } from "./OverlayCenter.js";

interface ConfirmModalProps {
  dialog: ConfirmDialogState | null;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ dialog }) => {
  if (!dialog) return null;

  return (
    <OverlayCenter>
      <Box
        width="80%"
        height={12}
        borderStyle="round"
        borderColor={THEME.pink}
        backgroundColor={THEME.bgElevated}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="column"
      >
        <Text color={THEME.pink}>░░ tool confirm ░░</Text>
        <Box height={1} />
        <Text bold>{dialog.title}</Text>
        <Text color={THEME.textMuted}>{dialog.message}</Text>
        <Box height={1} />
        <Text>
          <Text color="#67e8f9">Y</Text> allow <Text color="#f87171">N</Text>{" "}
          decline
        </Text>
      </Box>
    </OverlayCenter>
  );
};
