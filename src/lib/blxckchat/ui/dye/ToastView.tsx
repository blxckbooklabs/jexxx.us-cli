import React from "react";
import { Box, Text } from "@sauerapple/dye";

const TOAST_MS = 4000;

interface ToastViewProps {
  message: string | null;
  variant: "info" | "error";
  onDismiss: () => void;
}

export const ToastView: React.FC<ToastViewProps> = ({
  message,
  variant,
  onDismiss,
}) => {
  const onDismissRef = React.useRef(onDismiss);
  onDismissRef.current = onDismiss;

  React.useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => onDismissRef.current(), TOAST_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  const borderColor = variant === "error" ? "#f87171" : "#ec4899";

  return (
    <Box
      position="absolute"
      top={2}
      right={2}
      width={32}
      height={3}
      borderStyle="round"
      borderColor={borderColor}
      paddingLeft={1}
      paddingRight={1}
    >
      <Text color={borderColor}>
        {message.length > 120 ? `${message.slice(0, 117)}…` : message}
      </Text>
    </Box>
  );
};
