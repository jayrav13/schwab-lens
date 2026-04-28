import { describe, it, expect } from "vitest";
import { identifyTransactions, identifyPositions } from "@/lib/schwab/identify";

describe("identifyTransactions", () => {
  it("extracts label and external_id from filename", () => {
    expect(identifyTransactions("Demo_XXX100_Transactions_20260427-090135.csv")).toEqual({
      label: "Demo",
      externalId: "100",
    });
  });

  it("handles labels with underscores", () => {
    expect(
      identifyTransactions("Roth_IRA_XXX200_Transactions_20260427-090135.csv"),
    ).toEqual({
      label: "Roth_IRA",
      externalId: "200",
    });
  });

  it("returns null when filename does not match", () => {
    expect(identifyTransactions("random.csv")).toBeNull();
  });
});

describe("identifyPositions", () => {
  it("extracts label from filename and external_id from first line", () => {
    const filename = "Demo-Positions-2026-04-25-123847.csv";
    const content = `"Positions for account Demo ...100 as of 09:00 AM ET, 2026/04/25"\n\n"Symbol",...`;
    expect(identifyPositions(filename, content)).toEqual({
      label: "Demo",
      externalId: "100",
      asOf: "2026-04-25",
    });
  });

  it("returns null when first line does not match expected format", () => {
    const filename = "Demo-Positions-2026-04-25-123847.csv";
    const content = `"Some random first line"`;
    expect(identifyPositions(filename, content)).toBeNull();
  });

  it("returns identity from content even when filename label disagrees, with warning", () => {
    const filename = "Wrong-Positions-2026-04-25-123847.csv";
    const content = `"Positions for account Demo ...100 as of 09:00 AM ET, 2026/04/25"\n\n"Symbol",...`;
    const result = identifyPositions(filename, content);
    expect(result?.label).toBe("Demo");
    expect(result?.mismatchWarning).toContain("Wrong");
  });
});
