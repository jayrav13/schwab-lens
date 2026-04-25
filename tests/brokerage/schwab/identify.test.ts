import { describe, it, expect } from "vitest";
import {
  identifyFromTransactionsFilename,
  identifyFromPositionsContent,
  identifySchwab,
} from "@/lib/brokerage/schwab/identify";

describe("identifyFromTransactionsFilename", () => {
  it("extracts label and externalId", () => {
    expect(identifyFromTransactionsFilename("Demo_XXX999_Transactions_20260101-090000.csv"))
      .toEqual({ label: "Demo", externalId: "999" });
  });

  it("works with a path", () => {
    expect(identifyFromTransactionsFilename("/x/y/Demo_XXX999_Transactions_20260101-090000.csv"))
      .toEqual({ label: "Demo", externalId: "999" });
  });

  it("returns null for non-matching name", () => {
    expect(identifyFromTransactionsFilename("foo.csv")).toBeNull();
  });
});

describe("identifyFromPositionsContent", () => {
  it("parses label + externalId from first-line header", () => {
    const content = `"Positions for account Demo ...999 as of 09:00 AM ET, 2026/01/01"\n\n"Symbol",...`;
    expect(identifyFromPositionsContent(content)).toEqual({
      label: "Demo",
      externalId: "999",
    });
  });

  it("supports multi-word labels", () => {
    const content = `"Positions for account Wheel Account ...123 as of 09:00 AM ET, 2026/01/01"\n`;
    expect(identifyFromPositionsContent(content)).toEqual({
      label: "Wheel Account",
      externalId: "123",
    });
  });

  it("returns null when first line does not match", () => {
    expect(identifyFromPositionsContent("not a positions file")).toBeNull();
  });
});

describe("identifySchwab", () => {
  it("dispatches on filename for transactions", () => {
    expect(
      identifySchwab({
        filepath: "Demo_XXX999_Transactions_20260101-090000.csv",
        content: "Date,Action,Symbol\n",
      }),
    ).toEqual({ label: "Demo", externalId: "999" });
  });

  it("dispatches on content for positions", () => {
    expect(
      identifySchwab({
        filepath: "Demo-Positions-2026-01-15-090000.csv",
        content: `"Positions for account Demo ...999 as of 09:00 AM ET, 2026/01/01"\n`,
      }),
    ).toEqual({ label: "Demo", externalId: "999" });
  });

  it("throws on unrecognized file shape", () => {
    expect(() =>
      identifySchwab({ filepath: "weird.csv", content: "blah" }),
    ).toThrow(/Schwab/);
  });
});
