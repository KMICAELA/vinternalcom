import { useMemo } from "react";
import { useActiveQuarter } from "@/hooks/usePortfolioData";
import { getQuarterData } from "@/data/quarterRegistry";
import { computeXIRR } from "@/lib/calcEngine";

/**
 * Single source of truth for consolidated portfolio metrics.
 * Reads from the hardcoded QUARTER_REGISTRY keyed by the selected quarter.
 */
export function useConsolidatedMetrics() {
  const activeQuarter = useActiveQuarter();

  return useMemo(() => {
    const qData = getQuarterData(activeQuarter.quarter);

    if (!qData) {
      return {
        twhNavFromFunds: 0,
        twhCostFromFunds: 0,
        twhFmvFromFunds: 0,
        twhProceedsFromFunds: 0,
        directsCost: 0,
        directsFmv: 0,
        directsProceeds: 0,
        totalCapitalCalls: 0,
        totalDistributions: 0,
        grossTvpi: 0,
        netTvpi: 0,
        netIrr: null as number | null,
        grossIrr: null as number | null,
        totalNav: 0,
        grossFmv: 0,
        activeQuarter,
      };
    }

    return {
      twhNavFromFunds: Object.values(qData.fundNAVs).reduce((s, v) => s + v, 0),
      twhCostFromFunds: 0,
      twhFmvFromFunds: Object.values(qData.fundNAVs).reduce((s, v) => s + v, 0),
      twhProceedsFromFunds: 0,
      directsCost: qData.directsCost,
      directsFmv: qData.directsFMV,
      directsProceeds: 0,
      totalCapitalCalls: qData.netTotalContributions,
      totalDistributions: qData.netTotalDistributions,
      grossTvpi: qData.grossTVPI,
      netTvpi: qData.netTVPI,
      netIrr: qData.netIRR,
      grossIrr: qData.grossIRR,
      totalNav: qData.netTerminalNAV,
      grossFmv: qData.grossTerminalFMV,
      activeQuarter,
    };
  }, [activeQuarter]);
}
