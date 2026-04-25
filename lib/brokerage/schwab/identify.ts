import path from "node:path";
import type { AccountIdentity, ParseInput } from "@/lib/brokerage/types";
import { classifyFilename } from "@/lib/brokerage/schwab/filenames";

const TX_FILENAME = /^(.+)_XXX(\d{3})_Transactions_\d{8}-\d{6}\.csv$/;
const POS_HEADER = /Positions for account (.+?)\s*\.\.\.(\d{3})\s+as of/i;

export function identifyFromTransactionsFilename(
  filepathOrName: string,
): AccountIdentity | null {
  const base = path.basename(filepathOrName);
  const m = base.match(TX_FILENAME);
  if (!m) return null;
  return { label: m[1], externalId: m[2] };
}

export function identifyFromPositionsContent(
  content: string,
): AccountIdentity | null {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const m = firstLine.match(POS_HEADER);
  if (!m) return null;
  return { label: m[1].trim(), externalId: m[2] };
}

export function identifySchwab(input: ParseInput): AccountIdentity {
  const kind = classifyFilename(input.filepath);
  if (kind === "transactions") {
    const id = identifyFromTransactionsFilename(input.filepath);
    if (!id) {
      throw new Error(
        `identifySchwab: filename matched Transactions pattern but yielded no identity: ${input.filepath}`,
      );
    }
    return id;
  }
  if (kind === "positions") {
    const id = identifyFromPositionsContent(input.content);
    if (!id) {
      throw new Error(
        `identifySchwab: positions content does not contain a recognizable header: ${input.filepath}`,
      );
    }
    return id;
  }
  throw new Error(
    `identifySchwab: not a recognizable Schwab file: ${input.filepath}`,
  );
}
