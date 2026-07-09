import { resolveSlashCommandName } from "./registry.js";

/** Slash commands that open a dedicated modal picker — no inline arg menu. */
const PICKER_SLASH_COMMANDS = new Set([
  "model",
  "provider",
  "divinities",
]);

export function isPickerSlashCommand(commandName: string): boolean {
  const resolved = resolveSlashCommandName(commandName) ?? commandName;
  return PICKER_SLASH_COMMANDS.has(resolved);
}

/**
 * Picker commands with no typed argument should not populate the slash popup;
 * the user presses Enter to open the modal picker instead.
 */
export function shouldSuppressSlashArgumentSuggestions(
  commandName: string,
  argFilter: string,
): boolean {
  return isPickerSlashCommand(commandName) && !argFilter.trim();
}