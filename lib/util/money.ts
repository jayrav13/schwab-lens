export function parseCurrency(input: string | undefined | null): number {
  if (!input) return 0;
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) {
    throw new Error(`parseCurrency: cannot parse "${input}"`);
  }
  return n;
}

export function formatCurrency(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}
