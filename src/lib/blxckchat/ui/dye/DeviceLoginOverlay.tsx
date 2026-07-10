import React from "react";
import { Box, Text } from "@sauerapple/dye";
import { THEME } from "../theme.js";
import { OverlayCenter } from "./OverlayCenter.js";

export interface DeviceLoginDisplayState {
  status: string;
}

interface DeviceLoginOverlayProps {
  state: DeviceLoginDisplayState | null;
}

export const DeviceLoginOverlay: React.FC<DeviceLoginOverlayProps> = ({
  state,
}) => {
  if (!state) return null;

  return (
    <OverlayCenter>
      <Box
        width="82%"
        height={16}
        borderStyle="round"
        borderColor={THEME.pink}
        backgroundColor={THEME.bgElevated}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="column"
      >
        <Text color="#67e8f9">░ device authorization ░</Text>
        <Box height={1} />
        <Text>{state.status}</Text>
        <Box height={1} />
        <Text color="#525252">Esc cancel</Text>
      </Box>
    </OverlayCenter>
  );
};
