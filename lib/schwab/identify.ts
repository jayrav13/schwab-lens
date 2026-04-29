import path from "node:path";

export interface TransactionsIdentity {
  label: string;
  externalId: string;
}

export interface PositionsIdentity {
  label: string;
  externalId: string;
  asOf: string;
  mismatchWarning?: string;
}

const TX_FILENAME_RE = /^(.+)_XXX(\d{3})_Transactions_\d{8}-\d{6}\.csv$/;
const POS_FILENAME_RE = /^(.+)-Positions-(\d{4})-(\d{2})-(\d{2})-\d{6}\.csv$/;
const POS_HEADER_RE = /^"Positions for account (.+?) \.\.\.(\d{3}) as of /;

export function identifyTransactions(
  filepath: string,
): TransactionsIdentity | null {
  const base = path.basename(filepath);
  const match = base.match(TX_FILENAME_RE);
  if (!match) return null;
  return { label: match[1], externalId: match[2] };
}

export function identifyPositions(
  filepath: string,
  content: string,
): PositionsIdentity | null {
  const base = path.basename(filepath);
  const fileMatch = base.match(POS_FILENAME_RE);
  if (!fileMatch) return null;
  const filenameLabel = fileMatch[1];
  const asOf = `${fileMatch[2]}-${fileMatch[3]}-${fileMatch[4]}`;

  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const headerMatch = firstLine.match(POS_HEADER_RE);
  if (!headerMatch) return null;
  const contentLabel = headerMatch[1];
  const externalId = headerMatch[2];

  const mismatchWarning =
    contentLabel !== filenameLabel
      ? `Filename label "${filenameLabel}" disagrees with content label "${contentLabel}"`
      : undefined;

  return { label: contentLabel, externalId, asOf, mismatchWarning };
}
