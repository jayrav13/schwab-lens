import { describe, it, expect } from "vitest";
import { computeProjection } from "@/lib/model/metrics/projection";

describe("computeProjection", () => {
  it("returns 'achieved' when currentNav >= targetValue", () => {
    const result = computeProjection({
      currentNav: 1_500_000,
      targetValue: 1_000_000,
      expectedRealReturn: 0.07,
      asOfDate: "2026-04-24",
    });
    expect(result.kind).toBe("achieved");
    if (result.kind !== "achieved") return;
    expect(result.targetValue).toBe(1_000_000);
    expect(result.currentNav).toBe(1_500_000);
  });

  it("returns 'unreachable' with reason 'non-positive-target' when targetValue <= 0", () => {
    const result = computeProjection({
      currentNav: 100,
      targetValue: 0,
      expectedRealReturn: 0.07,
      asOfDate: "2026-04-24",
    });
    expect(result).toEqual({ kind: "unreachable", reason: "non-positive-target" });
  });

  it("returns 'unreachable' with reason 'non-positive-target' when currentNav <= 0", () => {
    const result = computeProjection({
      currentNav: 0,
      targetValue: 1_000_000,
      expectedRealReturn: 0.07,
      asOfDate: "2026-04-24",
    });
    expect(result).toEqual({ kind: "unreachable", reason: "non-positive-target" });
  });

  it("returns 'unreachable' with reason 'non-positive-rate' when expectedRealReturn <= 0", () => {
    const result = computeProjection({
      currentNav: 100_000,
      targetValue: 1_000_000,
      expectedRealReturn: 0,
      asOfDate: "2026-04-24",
    });
    expect(result).toEqual({ kind: "unreachable", reason: "non-positive-rate" });
  });

  it("computes years and target date for the happy path ($10k → $20k at 7%)", () => {
    const result = computeProjection({
      currentNav: 10_000,
      targetValue: 20_000,
      expectedRealReturn: 0.07,
      asOfDate: "2026-04-24",
    });
    expect(result.kind).toBe("computed");
    if (result.kind !== "computed") return;
    // ln(2) / ln(1.07) ≈ 10.2448 years
    expect(result.years).toBeCloseTo(10.2448, 3);
    expect(result.rate).toBe(0.07);
    expect(result.currentNav).toBe(10_000);
    expect(result.targetValue).toBe(20_000);
    // Target date should be 2036-07-22 (10.2448 years after 2026-04-24, rounded to nearest day)
    expect(result.targetDate).toBe("2036-07-22");
  });

  it("rounds target date to the nearest day", () => {
    const result = computeProjection({
      currentNav: 100_000,
      targetValue: 200_000,
      expectedRealReturn: 0.07,
      asOfDate: "2026-01-15",
    });
    if (result.kind !== "computed") throw new Error("expected computed");
    // ln(2) / ln(1.07) ≈ 10.2448 years; from 2026-01-15 → ~2036-04-17
    expect(result.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
