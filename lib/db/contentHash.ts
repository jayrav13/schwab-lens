import { createHash } from "node:crypto";

function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map(
        (k) =>
          JSON.stringify(k) + ":" + canonicalize((value as Record<string, unknown>)[k]),
      )
      .join(",") +
    "}"
  );
}

export function contentHash(input: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalize(input)).digest("hex");
}
