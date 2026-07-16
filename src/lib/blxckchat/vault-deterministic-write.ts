import { executeAccountQuery } from "../account-data/account-query.js";
import { deleteContact } from "../account-data/mutations.js";
import type { AuthenticatedAccountSession } from "../account-data/session.js";
import {
  extractContactDeleteFromText,
  isContactDeletePrompt,
} from "./account-routing.js";

export interface DeterministicVaultWriteResult {
  text: string;
  executed: boolean;
}

/**
 * Run delete_contact server-side when the user prompt is a contact deletion.
 * Models (especially MiniMax) often skip the tool or hallucinate success — this
 * guarantees the vault mutation happens before the persona reply is generated.
 */
export async function executeDeterministicContactDeleteIfRequested(
  userPrompt: string,
  session: AuthenticatedAccountSession,
): Promise<DeterministicVaultWriteResult | null> {
  if (!isContactDeletePrompt(userPrompt)) return null;

  const contactName = extractContactDeleteFromText(userPrompt);
  if (!contactName) return null;

  const deleteResult = await deleteContact(session, "blxckbook", contactName);

  let verifyText = "";
  try {
    verifyText = await executeAccountQuery(session, {
      action: "contacts",
      target: "blxckbook",
      limit: 50,
    });
  } catch (err) {
    verifyText = `account_query verification failed: ${
      err instanceof Error ? err.message : String(err)
    }`;
  }

  const stillListed = verifyText.toLowerCase().includes(contactName.toLowerCase());
  const verified = deleteResult.ok && !stillListed;

  const lines = [
    "## Server-executed vault delete (AUTHORITATIVE — report exactly this; never contradict)",
    `Requested contactName: "${contactName}"`,
    `delete_contact (BLXCKBOOK): ${deleteResult.message}`,
    "",
    "Post-delete account_query contacts:",
    verifyText,
  ];

  if (verified) {
    lines.push("", `VERIFIED: "${contactName}" is no longer in the contact list.`);
  } else if (deleteResult.ok && stillListed) {
    lines.push(
      "",
      `WARNING: delete reported success but "${contactName}" still appears in account_query — tell the user honestly.`,
    );
  } else if (!deleteResult.ok) {
    lines.push(
      "",
      "DELETE FAILED — tell the user honestly; do not claim the contact was removed.",
    );
  }

  lines.push(
    "",
    "Do NOT cite earlier conversation turns for who remains in the vault — only the account_query output above.",
    "Do NOT call delete_contact again for the same name unless the user repeats the request.",
  );

  return { executed: true, text: lines.join("\n") };
}