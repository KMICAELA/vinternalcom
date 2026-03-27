/**
 * Hardcoded quarter-level metrics — the single source of truth
 * for consolidated performance across the platform.
 */

export interface NetCashflow {
  date: string;
  portfolio: string;
  type: string;
  amount: number;
}

export interface QuarterData {
  label: string;
  quarterEndDate: string;
  netTerminalNAV: number;
  netTotalContributions: number;
  netTotalDistributions: number;
  netTVPI: number;
  netIRR: number | null;
  grossTerminalFMV: number;
  grossTotalCost: number;
  grossTVPI: number;
  grossIRR: number | null;
  activeFunds: string[];
  fundNAVs: Record<string, number>;
  fundTVPIs: Record<string, number | null>;
  activeDirects: { name: string; cost: number; fmv: number }[];
  totalCommitment: number;
  directsCost: number;
  directsFMV: number;
  netCashflows: NetCashflow[];
}

export const QUARTER_REGISTRY: Record<string, QuarterData> = {
  "1Q25": {
    label: "1Q25",
    quarterEndDate: "2025-03-31",
    netTerminalNAV: 3036100.75,
    netTotalContributions: 3597577.62,
    netTotalDistributions: 0,
    netTVPI: 0.8439,
    netIRR: null,
    grossTerminalFMV: 4206101,
    grossTotalCost: 3597578,
    activeFunds: [
      "Lowercarbon 421.0 Parallel Fund, LP",
      "Third Sphere Fund IV, LP",
      "Tamarack Global Opportunities II, LP",
      "Generational Partners Fund I, LP",
      "Leap Global Partners Fund II, LP",
    ],
    fundNAVs: {
      "Lowercarbon 421.0 Parallel Fund, LP": 807201,
      "Third Sphere Fund IV, LP": 803726,
      "Tamarack Global Opportunities II, LP": 1111529,
      "Generational Partners Fund I, LP": 319479,
      "Leap Global Partners Fund II, LP": 340027,
      "SVLC Fund III, LP": 0,
      "Cantos Ventures IV, LP": 0,
      "Quantonation 2 Feeder, LLC": 0,
      "Civilization Ventures Fund III, LP": 0,
      "ONEVC Fund III, LP": 0,
    },
    fundTVPIs: {
      "Lowercarbon 421.0 Parallel Fund, LP": 1.21,
      "Third Sphere Fund IV, LP": 0.80,
      "Tamarack Global Opportunities II, LP": 1.06,
      "Generational Partners Fund I, LP": 0.80,
      "Leap Global Partners Fund II, LP": 0.85,
    },
    activeDirects: [
      { name: "101OBEX, CORP", cost: 420000, fmv: 420000 },
      { name: "Earth AI, Inc.", cost: 750000, fmv: 750000 },
    ],
    totalCommitment: 8170000,
    directsCost: 1170000,
    directsFMV: 1170000,
    netCashflows: [
      { date: "2024-05-03", portfolio: "TWH Americas Fund I, LP", type: "Capital Call", amount: 1868605.98 },
      { date: "2024-08-14", portfolio: "TWH Americas Fund I, LP", type: "Capital Call", amount: 1728971.64 },
    ],
  },

  "2Q25": {
    label: "2Q25",
    quarterEndDate: "2025-06-30",
    netTerminalNAV: 10503968.64,
    netTotalContributions: 9358162.61,
    netTotalDistributions: 0,
    netTVPI: 1.1224,
    netIRR: 0.2183,
    grossTerminalFMV: 8625952 + 4070000,
    grossTotalCost: 9358163,
    activeFunds: [
      "Lowercarbon 421.0 Parallel Fund, LP",
      "Third Sphere Fund IV, LP",
      "Tamarack Global Opportunities II, LP",
      "Generational Partners Fund I, LP",
      "Leap Global Partners Fund II, LP",
      "SVLC Fund III, LP",
      "Cantos Ventures IV, LP",
      "Quantonation 2 Feeder, LLC",
    ],
    fundNAVs: {
      "Lowercarbon 421.0 Parallel Fund, LP": 912969,
      "Third Sphere Fund IV, LP": 784749,
      "Tamarack Global Opportunities II, LP": 4111442,
      "Generational Partners Fund I, LP": 492660,
      "Leap Global Partners Fund II, LP": 340027,
      "SVLC Fund III, LP": 603590,
      "Cantos Ventures IV, LP": 840799,
      "Quantonation 2 Feeder, LLC": 539716,
      "Civilization Ventures Fund III, LP": 0,
      "ONEVC Fund III, LP": 0,
    },
    fundTVPIs: {
      "Lowercarbon 421.0 Parallel Fund, LP": 1.37,
      "Third Sphere Fund IV, LP": 0.79,
      "Tamarack Global Opportunities II, LP": 2.84,
      "Generational Partners Fund I, LP": 0.99,
      "Leap Global Partners Fund II, LP": 0.85,
      "SVLC Fund III, LP": 0.89,
      "Cantos Ventures IV, LP": 1.20,
      "Quantonation 2 Feeder, LLC": null,
    },
    activeDirects: [
      { name: "101OBEX, CORP", cost: 420000, fmv: 420000 },
      { name: "Earth AI, Inc.", cost: 1000000, fmv: 1000000 },
      { name: "GENERATIONAL PARTNERS X VL SPV1", cost: 650000, fmv: 650000 },
      { name: "BRK Health Solutions", cost: 1000000, fmv: 1000000 },
      { name: "Canto of Arcadia, LP", cost: 500000, fmv: 500000 },
      { name: "Ares Materials, Inc.", cost: 500000, fmv: 500000 },
    ],
    totalCommitment: 17136143,
    directsCost: 4070000,
    directsFMV: 4070000,
    netCashflows: [
      { date: "2024-05-03", portfolio: "TWH Americas Fund I, LP", type: "Capital Call", amount: 1868605.98 },
      { date: "2024-08-14", portfolio: "TWH Americas Fund I, LP", type: "Capital Call", amount: 1728971.64 },
      { date: "2024-12-19", portfolio: "TWH Americas Fund I, LP", type: "Capital Call", amount: 2050584.99 },
      { date: "2025-02-20", portfolio: "TWH Americas Fund I, LP", type: "Capital Call", amount: 1000000.00 },
      { date: "2025-05-28", portfolio: "TWH Americas Fund I, LP", type: "Capital Call", amount: 2710000.00 },
    ],
  },

  "3Q25": {
    label: "3Q25",
    quarterEndDate: "2025-09-30",
    netTerminalNAV: 12096611.35,
    netTotalContributions: 12108162.61,
    netTotalDistributions: 0,
    netTVPI: 0.9990,
    netIRR: -0.00143,
    grossTerminalFMV: 7716342 + 4820000,
    grossTotalCost: 12108163,
    activeFunds: [
      "Lowercarbon 421.0 Parallel Fund, LP",
      "Third Sphere Fund IV, LP",
      "Tamarack Global Opportunities II, LP",
      "Generational Partners Fund I, LP",
      "Leap Global Partners Fund II, LP",
      "SVLC Fund III, LP",
      "Cantos Ventures IV, LP",
      "Quantonation 2 Feeder, LLC",
      "Civilization Ventures Fund III, LP",
      "ONEVC Fund III, LP",
    ],
    fundNAVs: {
      "Lowercarbon 421.0 Parallel Fund, LP": 852595,
      "Third Sphere Fund IV, LP": 716638,
      "Tamarack Global Opportunities II, LP": 4120927,
      "Generational Partners Fund I, LP": 502074,
      "Leap Global Partners Fund II, LP": 474322,
      "SVLC Fund III, LP": 656682,
      "Cantos Ventures IV, LP": 776942,
      "Quantonation 2 Feeder, LLC": 545740,
      "Civilization Ventures Fund III, LP": 0,
      "ONEVC Fund III, LP": 70422,
    },
    fundTVPIs: {
      "Lowercarbon 421.0 Parallel Fund, LP": 1.27,
      "Third Sphere Fund IV, LP": 0.72,
      "Tamarack Global Opportunities II, LP": 2.84,
      "Generational Partners Fund I, LP": 1.00,
      "Leap Global Partners Fund II, LP": 1.03,
      "SVLC Fund III, LP": 0.89,
      "Cantos Ventures IV, LP": 1.11,
      "Quantonation 2 Feeder, LLC": 1.05,
      "Civilization Ventures Fund III, LP": null,
      "ONEVC Fund III, LP": 0.88,
    },
    activeDirects: [
      { name: "101OBEX, CORP", cost: 420000, fmv: 420000 },
      { name: "Earth AI, Inc.", cost: 750000, fmv: 750000 },
      { name: "Earth AI, Inc. (2)", cost: 250000, fmv: 250000 },
      { name: "GENERATIONAL PARTNERS X VL SPV1", cost: 650000, fmv: 650000 },
      { name: "BRK Health Solutions", cost: 1000000, fmv: 1000000 },
      { name: "Canto of Arcadia, LP", cost: 500000, fmv: 500000 },
      { name: "Ares Materials, Inc.", cost: 500000, fmv: 500000 },
      { name: "General Biological Corporation", cost: 750000, fmv: 750000 },
    ],
    totalCommitment: 17886587,
    directsCost: 4820000,
    directsFMV: 4820000,
    netCashflows: [
      { date: "2024-05-08", portfolio: "TWH Americas Fund I, LP", type: "Capital Call", amount: 1868605.98 },
      { date: "2024-08-16", portfolio: "TWH Americas Fund I, LP", type: "Capital Call", amount: 1728971.64 },
      { date: "2024-12-19", portfolio: "TWH Americas Fund I, LP", type: "Capital Call", amount: 2050584.99 },
      { date: "2025-02-20", portfolio: "TWH Americas Fund I, LP", type: "Capital Call", amount: 1000000.00 },
      { date: "2025-05-28", portfolio: "TWH Americas Fund I, LP", type: "Capital Call", amount: 2710000.00 },
      { date: "2025-07-11", portfolio: "TWH Americas Fund I, LP", type: "Capital Call", amount: 1400000.00 },
      { date: "2025-09-10", portfolio: "TWH Americas Fund I, LP", type: "Capital Call", amount: 1350000.00 },
    ],
  },
};

/** Look up quarter data by quarter label (e.g. "1Q25") */
export function getQuarterData(quarterLabel: string): QuarterData | null {
  return QUARTER_REGISTRY[quarterLabel] || null;
}

/** Get chart data points from the registry */
export function getChartData() {
  return Object.values(QUARTER_REGISTRY).map(q => ({
    quarter: q.label,
    netTvpi: Number(q.netTVPI.toFixed(2)),
    grossTvpi: q.grossTotalCost > 0
      ? Number((q.grossTerminalFMV / q.grossTotalCost).toFixed(2))
      : null,
  }));
}
