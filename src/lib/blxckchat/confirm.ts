import * as readline from "readline";
import chalk from "chalk";

/**
 * Interactive y/n confirmation gate. Every tool marked requiresConfirmation
 * routes through here before execute() runs — the agent loop never
 * bypasses this, regardless of how confident the model's tool call looks.
 */
export function confirmToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.yellow(`\n[BLXCKCHAT] Wants to run: ${toolName}`));
  console.log(chalk.dim(JSON.stringify(args, null, 2)));

  return new Promise((resolve) => {
    rl.question(chalk.cyan("Allow this action? (y/N): "), (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().startsWith("y"));
    });
  });
}
