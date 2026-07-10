import type {
  ThinkingBlock,
  ToolResult,
  ToolStatus,
} from "../session/session-store.js";

export interface MessageBlock {
  type: "hero" | "welcome" | "user" | "assistant" | "tool" | "error" | "system";
  content: string;
  thinkingBlocks?: ThinkingBlock[];
  assistantRaw?: string;
  streamThinkingRaw?: string;
  isStreaming?: boolean;
  toolEntries?: ToolResult[];
}

export interface ScrollState {
  pinnedToBottom: boolean;
  percent: number;
}

export interface DyeConfig {
  providerLabel: string;
  authLabel: string;
  toolCount: number;
}

export interface DyeActionCallbacks {
  onSubmit: (line: string) => void;
  onEscape: () => void;
  onAbort: () => void;
  onExit: () => void;
  onToggleHotkeys: () => void;
  onOpenSearch: () => void;
  onCycleModelNext: () => void;
  onCycleModelPrev: () => void;
  onBranchUndo: () => void;
  onCopySnapshot: () => void;
  onCopyChrome: () => void;
  onCopyLastReply: () => void;
  onToggleThinking: () => void;
  onScrollUp: () => void;
  onScrollDown: () => void;
  onScrollPageUp: () => void;
  onScrollPageDown: () => void;
  onScrollHalfUp: () => void;
  onScrollHalfDown: () => void;
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
  onFocusInput: () => void;
  onOpenModelPicker: () => void;
  onOpenProviderPicker: () => void;
  onOpenDivinityPicker: () => void;
  onOpenAuthPicker: () => void;
  onOpenSlashPopup: (query: string) => void;
  onExportSession: () => Promise<string | null>;
  onNewSession: () => void;
  onOpenExternalEditor: (initial: string) => Promise<string | null>;
  onConfirmTool: (
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<boolean>;
}

export interface ToastState {
  message: string;
  variant: "info" | "error";
}

export interface ConfirmDialogState {
  title: string;
  message: string;
  resolve: (value: boolean) => void;
}

export interface PickerItemDef {
  id: string;
  label: string;
  description?: string;
}

export interface PickerOpenOptions {
  title?: string;
  selectedIndex?: number;
  hideFilter?: boolean;
  statusHeader?: string;
}

export interface JexxxusHeroMeta {
  authLabel: string;
  toolCount: number;
  providerLabel: string;
}

export interface PromptOverlayOptions {
  title: string;
  label: string;
  defaultValue?: string;
  hint?: string;
  secret?: boolean;
  height?: number;
}
