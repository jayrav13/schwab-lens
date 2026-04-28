import { describe, it, expect } from "vitest";
import { contentHash } from "@/lib/db/contentHash";

describe("contentHash", () => {
  it("is deterministic for the same input", () => {
    const a = contentHash({ external_id: "100", trade_date: "2026-01-15", amount: 50 });
    const b = contentHash({ external_id: "100", trade_date: "2026-01-15", amount: 50 });
    expect(a).toBe(b);
  });

  it("ignores key order", () => {
    const a = contentHash({ external_id: "100", trade_date: "2026-01-15", amount: 50 });
    const b = contentHash({ amount: 50, trade_date: "2026-01-15", external_id: "100" });
    expect(a).toBe(b);
  });

  it("differs for different inputs", () => {
    const a = contentHash({ external_id: "100", amount: 50 });
    const b = contentHash({ external_id: "100", amount: 51 });
    expect(a).not.toBe(b);
  });

  it("treats null and absent keys differently", () => {
    const a = contentHash({ x: null });
    const b = contentHash({});
    expect(a).not.toBe(b);
  });

  it("returns a 64-char hex string", () => {
    const h = contentHash({ x: 1 });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
