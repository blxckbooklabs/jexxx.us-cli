import React from "react";
import { Box, Text } from "@sauerapple/dye";
import { THEME } from "../theme.js";

interface SearchOverlayProps {
  query: string;
}

export const SearchOverlay: React.FC<SearchOverlayProps> = ({ query }) => {
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
