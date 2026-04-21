import { describe, it, expect } from "vitest";
import {
  FUNDS_FIELDS,
  DIRECTS_FIELDS,
  UNDERLYING_FIELDS,
} from "../runReconciliation";

/**
 * Guardrail: refactors must NOT silently truncate the per-section
 * comparison field whitelists. If you intentionally add or remove a
 * field, update the expected count here at the same time.
 */
describe("reconciliation field whitelist", () => {
  it("Funds compares 16 fields", () => {
    expect(FUNDS_FIELDS).toHaveLength(16);
    expect(FUNDS_FIELDS).toEqual(
      expect.arrayContaining([
        "Commitment",
        "Contributions",
        "Distributions",
        "NAV",
        "Total Value",
        "TVPI",
        "DPI",
        "IRR",
        "MOIC",
        "Investment Date",
        "TWH Ownership %",
        "TWH Commitment",
        "TWH Contributions",
        "TWH Distributions",
        "TWH NAV",
        "TWH Value",
      ]),
    );
  });

  it("Directs compares 9 fields", () => {
    expect(DIRECTS_FIELDS).toHaveLength(9);
    expect(DIRECTS_FIELDS).toEqual(
      expect.arrayContaining([
        "Investment Date",
        "Investment Cost",
        "FMV",
        "Proceeds",
        "MOIC",
        "TWH Ownership %",
        "TWH Cost",
        "TWH FMV",
        "TWH Proceeds",
      ]),
    );
  });

  it("Underlying Holdings compares 9 fields", () => {
    expect(UNDERLYING_FIELDS).toHaveLength(9);
    expect(UNDERLYING_FIELDS).toEqual(
      expect.arrayContaining([
        "Investment Date",
        "Investment Cost",
        "FMV",
        "Proceeds",
        "MOIC",
        "TWH Ownership %",
        "TWH Cost",
        "TWH FMV",
        "TWH Proceeds",
      ]),
    );
  });
});
