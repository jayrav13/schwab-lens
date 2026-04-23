import { describe, it, expect } from "vitest";
import { parseConfig } from "@/lib/config";

describe("parseConfig", () => {
  it("parses a valid config JSON with marketData disabled by default", () => {
    const c = parseConfig(
      JSON.stringify({ seedDate: "2026-01-15", seedValue: 12345 }),
    );
    expect(c).toEqual({
      seedDate: "2026-01-15",
      seedValue: 12345,
      marketData: { enabled: false },
    });
  });

  it("parses marketData.enabled=true when set", () => {
    const c = parseConfig(
      JSON.stringify({
        seedDate: "2026-01-15",
        seedValue: 12345,
        marketData: { enabled: true },
      }),
    );
    expect(c.marketData).toEqual({ enabled: true });
  });

  it("throws on missing seedDate", () => {
    expect(() => parseConfig(JSON.stringify({ seedValue: 100 }))).toThrow(
      /seedDate/,
    );
  });

  it("throws on non-ISO seedDate", () => {
    expect(() =>
      parseConfig(JSON.stringify({ seedDate: "1/1/2026", seedValue: 100 })),
    ).toThrow(/YYYY-MM-DD/);
  });

  it("throws on non-numeric seedValue", () => {
    expect(() =>
      parseConfig(JSON.stringify({ seedDate: "2026-01-15", seedValue: "25k" })),
    ).toThrow(/seedValue/);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseConfig("not json")).toThrow();
  });
});

describe("parseConfig benchmark field", () => {
  it("omits benchmark when the field is absent", () => {
    const cfg = parseConfig(
      JSON.stringify({
        seedDate: "2026-01-15",
        seedValue: 12345,
        marketData: { enabled: true },
      }),
    );
    expect(cfg.benchmark).toBeUndefined();
  });

  it("accepts a non-empty string benchmark", () => {
    const cfg = parseConfig(
      JSON.stringify({
        seedDate: "2026-01-15",
        seedValue: 12345,
        marketData: { enabled: true },
        benchmark: "SPY",
      }),
    );
    expect(cfg.benchmark).toBe("SPY");
  });

  it("accepts explicit null as off", () => {
    const cfg = parseConfig(
      JSON.stringify({
        seedDate: "2026-01-15",
        seedValue: 12345,
        marketData: { enabled: true },
        benchmark: null,
      }),
    );
    expect(cfg.benchmark).toBeNull();
  });

  it("treats a non-string, non-null benchmark as undefined", () => {
    const cfg = parseConfig(
      JSON.stringify({
        seedDate: "2026-01-15",
        seedValue: 12345,
        marketData: { enabled: true },
        benchmark: 42,
      }),
    );
    expect(cfg.benchmark).toBeUndefined();
  });

  it("treats an empty string benchmark as undefined", () => {
    const cfg = parseConfig(
      JSON.stringify({
        seedDate: "2026-01-15",
        seedValue: 12345,
        marketData: { enabled: true },
        benchmark: "",
      }),
    );
    expect(cfg.benchmark).toBeUndefined();
  });
});
