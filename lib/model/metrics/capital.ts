import type { PortfolioState } from "@/lib/model/types";

export type CapitalView = {
  putCollateral: number;      // strike × 100 × qty summed over open puts
  sharesAtCost: number;       // held shares × weighted cost
  deployed: number;           // putCollateral + sharesAtCost
  cash: number;
  nav: number;
  deployedPctOfNav: number;
  freePctOfNav: number;
};

export function computeCapitalAtRisk(state: PortfolioState): CapitalView {
  const putCollateral = state.openOptionPositions
    .filter((o) => o.contract.type === "Put")
    .reduce((a, o) => a + o.contract.strike * 100 * o.quantityOpen, 0);

  const sharesAtCost = state.openSharePositions.reduce(
    (a, s) => a + s.shares * s.weightedCostBasis,
    0,
  );

  const cash = state.cashLedger.at(-1)?.balance ?? state.config.seedValue;
  const nav = state.navSeries.at(-1)?.nav ?? state.config.seedValue;
  const deployed = putCollateral + sharesAtCost;
  const deployedPctOfNav = nav === 0 ? 0 : deployed / nav;
  const freePctOfNav = 1 - deployedPctOfNav;

  return {
    putCollateral,
    sharesAtCost,
    deployed,
    cash,
    nav,
    deployedPctOfNav,
    freePctOfNav,
  };
}
