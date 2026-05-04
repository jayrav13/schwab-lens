import { describe, it, expect } from "vitest";
import {
  daysBetweenIso,
  formatRelativeFromNow,
} from "@/lib/util/relativeTime";

describe("daysBetweenIso", () => {
  it("returns 0 for the same instant", () => {
    expect(
      daysBetweenIso("2026-04-30T12:00:00Z", "2026-04-30T12:00:00Z"),
    ).toBe(0);
  });

  it("counts whole days regardless of clock-time", () => {
    expect(
      daysBetweenIso("2026-04-25T00:00:00Z", "2026-04-30T23:00:00Z"),
    ).toBe(5);
  });

  it("returns negative when then is in the future", () => {
    expect(
      daysBetweenIso("2026-05-01T00:00:00Z", "2026-04-30T00:00:00Z"),
    ).toBe(-1);
  });
});

describe("formatRelativeFromNow", () => {
  const now = "2026-05-01T12:00:00Z";
  const cases: Array<[string, string]> = [
    ["2026-05-01T11:59:30Z", "just now"],
    ["2026-05-01T11:55:00Z", "5 minutes ago"],
    ["2026-05-01T08:00:00Z", "4 hours ago"],
    ["2026-04-30T11:00:00Z", "yesterday"],
    ["2026-04-28T12:00:00Z", "3 days ago"],
    ["2026-04-15T12:00:00Z", "2 weeks ago"],
    ["2026-02-15T12:00:00Z", "2 months ago"],
    ["2025-04-01T12:00:00Z", "1 year ago"],
    ["2024-05-01T12:00:00Z", "2 years ago"],
  ];

  for (const [then, expected] of cases) {
    it(`formats ${then} → "${expected}"`, () => {
      expect(formatRelativeFromNow(then, now)).toBe(expected);
    });
  }

  it("handles unparseable input gracefully", () => {
    expect(formatRelativeFromNow("nonsense", now)).toBe("—");
  });
});
