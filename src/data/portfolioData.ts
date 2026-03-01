// TWH Americas Fund I, LP — Q3 2025 Portfolio Metrics

export interface FundSummary {
  name: string;
  quarter: string;
  reportDate: string;
  ownership: string;
  totalContributions: number;
  totalDistributions: number;
  nav: number;
  netTVPI: string;
  netIRR: string;
  grossContributions: number;
  grossDistributions: number;
  grossNAV: number;
  grossTVPI: string;
  grossIRR: string;
}

export interface NetReturnEntry {
  date: string;
  contribution: number;
  distribution: number;
  nav: number;
  netTVPI: string;
  netIRR: string;
}

export interface GrossReturnEntry {
  date: string;
  contribution: number;
  distribution: number;
  nav: number;
  grossTVPI: string;
  grossIRR: string;
}

export interface FundHolding {
  name: string;
  startDate: string;
  totalCommitment: number;
  twhCommitment: number;
  twhPercent: string;
  twhContributions: number;
  twhDistributions: number;
  twhNAV: number;
  pic: string;
  rvpi: string;
  dpi: string;
  tvpi: string;
  moic: string;
  irr: string;
  notes: string;
}

export interface DirectInvestment {
  company: string;
  date: string;
  instrument: string;
  round: string;
  cost: number;
  fmv: number;
  proceeds: number;
  coInvestors: string;
  rvpi: string;
  dpi: string;
  moic: string;
  irr: string;
  holdingDays: number;
}

export interface UnderlyingHolding {
  company: string;
  fund: string;
  status: string;
  date: string;
  instrument: string;
  round: string;
  investmentCost: number;
  fmv: number;
  proceeds: number;
  moic: string;
  twhCost: number;
  twhFMV: number;
}

export interface CashFlowEntry {
  date: string;
  portfolio: string;
  type: string;
  contribution: number;
  distribution: number;
  nav: number;
  cf: number;
  note: string;
}

// ---- DATA ----

export const fundSummary: FundSummary = {
  name: "TWH Americas Fund I, LP",
  quarter: "Q3 2025",
  reportDate: "September 30, 2025",
  ownership: "14.99%",
  totalContributions: -3597577.62,
  totalDistributions: 0,
  nav: 3036100.75,
  netTVPI: "0.84x",
  netIRR: "-46.78%",
  grossContributions: -3438900,
  grossDistributions: 0,
  grossNAV: 7086556,
  grossTVPI: "2.06x",
  grossIRR: "134.04%",
};

export const netReturns: NetReturnEntry[] = [
  { date: "Q1 2024", contribution: 0, distribution: 0, nav: 0, netTVPI: "0.00x", netIRR: "0.00%" },
  { date: "Q2 2024", contribution: -1868606, distribution: 0, nav: 1236101, netTVPI: "0.66x", netIRR: "-92.58%" },
];

export const grossReturns: GrossReturnEntry[] = [
  { date: "Q1 2024", contribution: 0, distribution: 0, nav: 0, grossTVPI: "0.00x", grossIRR: "0.00%" },
  { date: "Q2 2024", contribution: -738900, distribution: 0, nav: 738900, grossTVPI: "1.00x", grossIRR: "0.00%" },
  { date: "Q3 2024", contribution: -2238900, distribution: 0, nav: 2161341, grossTVPI: "0.97x", grossIRR: "-14.90%" },
  { date: "Q4 2024", contribution: -3438900, distribution: 0, nav: 3215011.13, grossTVPI: "0.93x", grossIRR: "-18.20%" },
];

export const fundHoldings: FundHolding[] = [
  { name: "Lowercarbon 421.0 Parallel Fund, LP", startDate: "20-May-24", totalCommitment: 324278409, twhCommitment: 1000000, twhPercent: "0.31%", twhContributions: 668900, twhDistributions: 0, twhNAV: 852595, pic: "0.67x", rvpi: "1.32x", dpi: "0.00x", tvpi: "1.32x", moic: "1.75x", irr: "0.80%", notes: "FS of 3Q25" },
  { name: "Third Sphere Fund IV, LP", startDate: "27-Jul-24", totalCommitment: 43086600, twhCommitment: 2000000, twhPercent: "4.80%", twhContributions: 1000000, twhDistributions: 0, twhNAV: 716638, pic: "0.50x", rvpi: "0.73x", dpi: "0.00x", tvpi: "0.73x", moic: "0.85x", irr: "-49.44%", notes: "FS of 2Q25" },
  { name: "Tamarack Global Opportunities II, LP", startDate: "1-Aug-24", totalCommitment: 72115000, twhCommitment: 2000000, twhPercent: "2.77%", twhContributions: 1450000, twhDistributions: 0, twhNAV: 4120927, pic: "0.72x", rvpi: "3.31x", dpi: "0.00x", tvpi: "3.31x", moic: "3.50x", irr: "22.71%", notes: "FS of 3Q25" },
  { name: "Generational Partners Fund I, LP", startDate: "30-Oct-24", totalCommitment: 5755280, twhCommitment: 1000000, twhPercent: "17.38%", twhContributions: 500000, twhDistributions: 0, twhNAV: 502074, pic: "0.50x", rvpi: "1.00x", dpi: "0.00x", tvpi: "1.00x", moic: "1.31x", irr: "-79.47%", notes: "FS of 3Q25" },
  { name: "Leap Global Partners Fund II, LP", startDate: "14-Nov-24", totalCommitment: 51750000, twhCommitment: 1000000, twhPercent: "1.93%", twhContributions: 460000, twhDistributions: 0, twhNAV: 474322, pic: "0.47x", rvpi: "1.06x", dpi: "0.00x", tvpi: "1.06x", moic: "1.09x", irr: "-98.74%", notes: "FS of 3Q25" },
  { name: "SVLC Fund III, LP", startDate: "24-Apr-25", totalCommitment: 15000000, twhCommitment: 1000000, twhPercent: "6.67%", twhContributions: 740811, twhDistributions: 0, twhNAV: 656682, pic: "0.74x", rvpi: "0.89x", dpi: "0.00x", tvpi: "0.89x", moic: "1.05x", irr: "0.00%", notes: "FS of 3Q25" },
  { name: "Cantos Ventures IV, LP", startDate: "5-May-25", totalCommitment: 35000000, twhCommitment: 2000000, twhPercent: "5.71%", twhContributions: 700000, twhDistributions: 0, twhNAV: 776942, pic: "0.33x", rvpi: "1.15x", dpi: "0.00x", tvpi: "1.15x", moic: "1.30x", irr: "0.00%", notes: "FS of 3Q25" },
  { name: "Quantonation 2 Feeder, LLC", startDate: "8-Jul-25", totalCommitment: 154318217.40, twhCommitment: 1066142.52, twhPercent: "0.69%", twhContributions: 517838.40, twhDistributions: 0, twhNAV: 539716.48, pic: "0.49x", rvpi: "1.04x", dpi: "0.00x", tvpi: "1.04x", moic: "1.13x", irr: "0.00%", notes: "FS of 2Q25" },
  { name: "ONEVC Fund III, LP", startDate: "15-Sep-25", totalCommitment: 22337280.96, twhCommitment: 1000000, twhPercent: "4.48%", twhContributions: 80000, twhDistributions: 0, twhNAV: 70422, pic: "0.08x", rvpi: "0.88x", dpi: "0.00x", tvpi: "0.88x", moic: "1.00x", irr: "0.00%", notes: "FS of 3Q25" },
];

export const directInvestments: DirectInvestment[] = [
  { company: "101OBEX, CORP", date: "20-May-24", instrument: "SAFE", round: "Seed", cost: 420000, fmv: 420000, proceeds: 0, coInvestors: "Guardian Capital", rvpi: "1.00x", dpi: "0.00x", moic: "1.00x", irr: "0.00%", holdingDays: 581 },
  { company: "Earth AI, Inc.", date: "21-Feb-25", instrument: "SAFE", round: "B", cost: 750000, fmv: 750000, proceeds: 0, coInvestors: "Tamarack, Cantos", rvpi: "1.00x", dpi: "0.00x", moic: "1.00x", irr: "0.00%", holdingDays: 304 },
  { company: "Generational Partners X VL SPV1", date: "1-May-25", instrument: "SPV", round: "Seed", cost: 650000, fmv: 650000, proceeds: 0, coInvestors: "Generational, Cantos, General Catalyst", rvpi: "1.00x", dpi: "0.00x", moic: "1.00x", irr: "0.00%", holdingDays: 235 },
  { company: "BRK Health Solutions", date: "30-Jul-25", instrument: "SAFE", round: "A", cost: 1000000, fmv: 1000000, proceeds: 0, coInvestors: "Dalus, FEMSA Ventures, Cathay Ventures, Foundation Capital", rvpi: "1.00x", dpi: "0.00x", moic: "1.00x", irr: "0.00%", holdingDays: 145 },
  { company: "Canto of Arcadia, LP", date: "15-Aug-25", instrument: "SPV", round: "B", cost: 500000, fmv: 500000, proceeds: 0, coInvestors: "Cantos, Interlagos", rvpi: "1.00x", dpi: "0.00x", moic: "1.00x", irr: "0.00%", holdingDays: 129 },
  { company: "Ares Materials, Inc.", date: "30-Aug-25", instrument: "Pref. Equity", round: "B", cost: 500000, fmv: 500000, proceeds: 0, coInvestors: "Endurance28, Black Diamond Ventures", rvpi: "1.00x", dpi: "0.00x", moic: "1.00x", irr: "0.00%", holdingDays: 114 },
  { company: "Earth AI, Inc. (2nd)", date: "11-Jun-25", instrument: "SAFE", round: "B", cost: 250000, fmv: 250000, proceeds: 0, coInvestors: "Tamarack, Cantos", rvpi: "1.00x", dpi: "0.00x", moic: "1.00x", irr: "0.00%", holdingDays: 0 },
];

// Top underlying portfolio holdings (by TWH FMV)
export const topUnderlyingHoldings: UnderlyingHolding[] = [
  { company: "Crux Climate, Inc.", fund: "Lowercarbon", status: "Active", date: "11-Apr-23", instrument: "Pref. Equity", round: "Seed", investmentCost: 2399999, fmv: 24236470, proceeds: 0, moic: "10.10x", twhCost: 7401.04, twhFMV: 74739.70 },
  { company: "Chaos Industries, Inc.", fund: "Tamarack", status: "Active", date: "23-Aug-24", instrument: "Pref. Equity", round: "B", investmentCost: 3249995, fmv: 8847095.29, proceeds: 0, moic: "2.72x", twhCost: 90133.68, twhFMV: 245360.75 },
  { company: "Chaos Industries, Inc.", fund: "Tamarack", status: "Active", date: "2-Aug-24", instrument: "Pref. Equity", round: "B", investmentCost: 2000000, fmv: 8326660.86, proceeds: 0, moic: "4.16x", twhCost: 55466.96, twhFMV: 230927.29 },
  { company: "Crux Climate, Inc.", fund: "Lowercarbon", status: "Active", date: "29-Jan-24", instrument: "Pref. Equity", round: "A", investmentCost: 2800421, fmv: 11110309, proceeds: 0, moic: "3.97x", twhCost: 8635.85, twhFMV: 34261.64 },
  { company: "Diraq", fund: "Quantonation", status: "Active", date: "14-Mar-24", instrument: "Pref. Equity", round: "A", investmentCost: 3585529.86, fmv: 5482673.32, proceeds: 0, moic: "1.53x", twhCost: 24771.45, twhFMV: 37878.30 },
  { company: "Earth AI, Inc.", fund: "Tamarack", status: "Active", date: "23-Dec-24", instrument: "Pref. Equity", round: "B", investmentCost: 1500000, fmv: 2414628, proceeds: 0, moic: "1.61x", twhCost: 41600.22, twhFMV: 66966.04 },
  { company: "Blue Energy Global Inc.", fund: "Tamarack", status: "Active", date: "17-Jun-24", instrument: "Pref. Equity", round: "A", investmentCost: 1250000, fmv: 2250029, proceeds: 0, moic: "1.80x", twhCost: 34666.85, twhFMV: 62401.14 },
  { company: "Cloover Sustainability AB", fund: "Lowercarbon", status: "Active", date: "29-Apr-24", instrument: "Pref. Equity", round: "Seed", investmentCost: 3700457, fmv: 4045249, proceeds: 0, moic: "1.09x", twhCost: 11411.36, twhFMV: 12474.62 },
];

// Portfolio-level cash flows per fund
export const portfolioCashFlows = [
  { fund: "101OBEX, CORP", nav: 420000, tvpi: "1.00x", irr: "0.00%" },
  { fund: "Lowercarbon 421.0 Parallel Fund", nav: 670281.50, tvpi: "1.00x", irr: "0.80%" },
  { fund: "Third Sphere Fund IV", nav: 559340, tvpi: "0.75x", irr: "-49.44%" },
  { fund: "Tamarack Global Opportunities II", nav: 1124723, tvpi: "1.07x", irr: "22.71%" },
  { fund: "Generational Partners Fund I", nav: 229265, tvpi: "0.76x", irr: "-79.47%" },
  { fund: "Leap Global Partners Fund II", nav: 211401.63, tvpi: "0.85x", irr: "-98.74%" },
];

export const formatCurrency = (value: number, compact = false): string => {
  if (value === 0) return "$0";
  const abs = Math.abs(value);
  if (compact && abs >= 1000000) {
    return `${value < 0 ? "-" : ""}$${(abs / 1000000).toFixed(2)}M`;
  }
  if (compact && abs >= 1000) {
    return `${value < 0 ? "-" : ""}$${(abs / 1000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatCurrencyFull = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
