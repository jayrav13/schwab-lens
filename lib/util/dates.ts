const MDY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

export function parseTradeDate(raw: string): string {
  if (!raw) throw new Error("parseTradeDate: empty input");

  const asOfMatch = raw.match(/as of (\d{1,2}\/\d{1,2}\/\d{4})/);
  const source = asOfMatch ? asOfMatch[1] : raw.trim().split(/\s+/)[0];

  const m = source.match(MDY);
  if (!m) throw new Error(`parseTradeDate: cannot parse "${raw}"`);

  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}
