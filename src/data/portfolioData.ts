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
  twhPercent: string;
  twhCost: number;
  twhFMV: number;
}

export interface PortfolioComment {
  company: string;
  description: string;
  targetMarket: string;
  tailwinds: string;
  challenges: string;
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

// Full underlying portfolio (USD + EUR funds combined)
export const underlyingPortfolio: UnderlyingHolding[] = [
  { company: "Agrippa Industries Inc.", fund: "Lowercarbon", status: "Active", date: "29-Jul-24", instrument: "Pref. Equity", round: "Seed", investmentCost: 7999998, fmv: 7999998, proceeds: 0, moic: "1.00x", twhPercent: "0.31%", twhCost: 24670.15, twhFMV: 24670.15 },
  { company: "Air Company Holdings, Inc.", fund: "Lowercarbon", status: "Active", date: "1-Apr-24", instrument: "Pref. Equity", round: "B", investmentCost: 7499988, fmv: 7499988, proceeds: 0, moic: "1.00x", twhPercent: "0.31%", twhCost: 23128.24, twhFMV: 23128.24 },
  { company: "Airloom Energy, Inc.", fund: "Lowercarbon", status: "Active", date: "14-May-24", instrument: "Pref. Equity", round: "Seed", investmentCost: 3652191, fmv: 3815352, proceeds: 0, moic: "1.04x", twhPercent: "0.31%", twhCost: 11262.52, twhFMV: 11765.67 },
  { company: "Airtonomy Inc.", fund: "Generational", status: "Active", date: "23-Jan-23", instrument: "Pref. Equity", round: "A", investmentCost: 99977, fmv: 100869, proceeds: 0, moic: "1.01x", twhPercent: "17.38%", twhCost: 17371.35, twhFMV: 17526.34 },
  { company: "allunderground GmbH", fund: "Lowercarbon", status: "Active", date: "23-Dec-24", instrument: "Note", round: "Seed", investmentCost: 2193030, fmv: 2462334, proceeds: 0, moic: "1.12x", twhPercent: "0.31%", twhCost: 6762.80, twhFMV: 7593.27 },
  { company: "Andean Inc.", fund: "Cantos", status: "Active", date: "12-Sep-25", instrument: "SAFE", round: "Seed", investmentCost: 1000000, fmv: 1000000, proceeds: 0, moic: "1.00x", twhPercent: "5.71%", twhCost: 57142.86, twhFMV: 57142.86 },
  { company: "Around Corp.", fund: "Leap", status: "Write-off", date: "6-Jun-22", instrument: "Pref. Equity", round: "Seed", investmentCost: 1500000, fmv: 0, proceeds: 0, moic: "0.00x", twhPercent: "1.93%", twhCost: 28985.51, twhFMV: 0 },
  { company: "Beam Tech Inc.", fund: "Third Sphere", status: "Active", date: "29-Jan-25", instrument: "SAFE", round: "Seed", investmentCost: 700000, fmv: 700000, proceeds: 0, moic: "1.00x", twhPercent: "4.80%", twhCost: 33600, twhFMV: 33600 },
  { company: "Blue Energy Global Inc.", fund: "Tamarack", status: "Active", date: "17-Jun-24", instrument: "Pref. Equity", round: "A", investmentCost: 3749998, fmv: 4750027, proceeds: 0, moic: "1.27x", twhPercent: "2.77%", twhCost: 104000.50, twhFMV: 131734.78 },
  { company: "Boombox Interactive, Inc.", fund: "Leap", status: "Active", date: "28-Mar-25", instrument: "Pref. Equity", round: "Seed", investmentCost: 1250092, fmv: 1250092, proceeds: 0, moic: "1.00x", twhPercent: "1.93%", twhCost: 24156.37, twhFMV: 24156.37 },
  { company: "Bright Harbor Recovery, Inc.", fund: "Lowercarbon", status: "Active", date: "12-May-25", instrument: "Pref. Equity", round: "Seed", investmentCost: 3000000, fmv: 3000000, proceeds: 0, moic: "1.00x", twhPercent: "0.31%", twhCost: 9251.31, twhFMV: 9251.31 },
  { company: "CargoKite GmbH", fund: "Lowercarbon", status: "Active", date: "4-Dec-23", instrument: "Pref. Equity", round: "Seed", investmentCost: 3283190, fmv: 3517823, proceeds: 0, moic: "1.07x", twhPercent: "0.31%", twhCost: 10124.60, twhFMV: 10848.16 },
  { company: "Cascade Biocatalysts, Inc.", fund: "SVLC", status: "Active", date: "8-Aug-25", instrument: "Pref. Equity", round: "Seed", investmentCost: 900000, fmv: 900000, proceeds: 0, moic: "1.00x", twhPercent: "6.67%", twhCost: 60000, twhFMV: 60000 },
  { company: "Chaos Industries, Inc.", fund: "Tamarack", status: "Active", date: "2-Aug-24", instrument: "Pref. Equity", round: "B", investmentCost: 5249995, fmv: 17173756.15, proceeds: 0, moic: "3.27x", twhPercent: "2.77%", twhCost: 145600.64, twhFMV: 476288.04 },
  { company: "Checksum AI, Inc.", fund: "Leap", status: "Active", date: "6-Oct-24", instrument: "Pref. Equity", round: "Seed", investmentCost: 2499999, fmv: 2499999, proceeds: 0, moic: "1.00x", twhPercent: "1.93%", twhCost: 48309.16, twhFMV: 48309.16 },
  { company: "Chirp Robotics Corporation", fund: "Tamarack", status: "Active", date: "19-May-25", instrument: "SAFE", round: "Seed", investmentCost: 2500000, fmv: 2500000, proceeds: 0, moic: "1.00x", twhPercent: "2.77%", twhCost: 69333.70, twhFMV: 69333.70 },
  { company: "Cloover Sustainability AB", fund: "Lowercarbon", status: "Active", date: "29-Apr-24", instrument: "Pref. Equity", round: "Seed", investmentCost: 3700457, fmv: 4045249, proceeds: 0, moic: "1.09x", twhPercent: "0.31%", twhCost: 11411.36, twhFMV: 12474.62 },
  { company: "Coronal Technologies, Inc.", fund: "Generational", status: "Active", date: "22-Aug-24", instrument: "SAFE", round: "Pre-Seed", investmentCost: 250000, fmv: 250000, proceeds: 0, moic: "1.00x", twhPercent: "17.38%", twhCost: 43438.37, twhFMV: 43438.37 },
  { company: "Crux Climate, Inc.", fund: "Lowercarbon", status: "Active", date: "11-Apr-23", instrument: "Pref. Equity", round: "Seed", investmentCost: 9331832, fmv: 42648306, proceeds: 0, moic: "4.57x", twhPercent: "0.31%", twhCost: 28777.22, twhFMV: 131517.56 },
  { company: "Cubbo Holdings Limited", fund: "SVLC", status: "Active", date: "9-Nov-22", instrument: "SAFE", round: "Seed", investmentCost: 1500000, fmv: 1500000, proceeds: 0, moic: "1.00x", twhPercent: "6.67%", twhCost: 100000, twhFMV: 100000 },
  { company: "Diraq", fund: "Quantonation", status: "Active", date: "2-Jan-24", instrument: "Pref. Equity", round: "A", investmentCost: 18364367.50, fmv: 28000636.40, proceeds: 0, moic: "1.52x", twhPercent: "0.69%", twhCost: 126871.87, twhFMV: 193457.12 },
  { company: "Earth AI, Inc.", fund: "Tamarack", status: "Active", date: "23-Dec-24", instrument: "Pref. Equity", round: "B", investmentCost: 5499999, fmv: 6414627, proceeds: 0, moic: "1.17x", twhPercent: "2.77%", twhCost: 152534.12, twhFMV: 177899.94 },
  { company: "Earth Force Technologies, Inc.", fund: "Third Sphere", status: "Active", date: "7-Oct-22", instrument: "Pref. Equity", round: "Seed", investmentCost: 1228750, fmv: 1554354, proceeds: 0, moic: "1.27x", twhPercent: "4.80%", twhCost: 58980, twhFMV: 74608.99 },
  { company: "Earth XYZ, Inc.", fund: "Lowercarbon", status: "Active", date: "20-May-24", instrument: "Pref. Equity", round: "Seed", investmentCost: 5400000, fmv: 15713997, proceeds: 0, moic: "2.91x", twhPercent: "0.31%", twhCost: 16652.36, twhFMV: 48458.35 },
  { company: "Earthmover PBC", fund: "Lowercarbon", status: "Active", date: "21-Sep-23", instrument: "Pref. Equity", round: "Seed", investmentCost: 3473096, fmv: 3823253, proceeds: 0, moic: "1.10x", twhPercent: "0.31%", twhCost: 10710.23, twhFMV: 11790.03 },
  { company: "ElectroPhotonic-IC Inc.", fund: "Cantos", status: "Active", date: "6-Mar-25", instrument: "Pref. Equity", round: "C+", investmentCost: 2499999.95, fmv: 2499999.95, proceeds: 0, moic: "1.00x", twhPercent: "5.71%", twhCost: 142857.14, twhFMV: 142857.14 },
  { company: "Eli Technologies, Inc.", fund: "Lowercarbon", status: "Active", date: "27-Mar-23", instrument: "Pref. Equity", round: "Seed", investmentCost: 3306000, fmv: 3972140, proceeds: 0, moic: "1.20x", twhPercent: "0.31%", twhCost: 10194.94, twhFMV: 12249.16 },
  { company: "Emerald AI, Inc.", fund: "Lowercarbon", status: "Active", date: "30-Jul-25", instrument: "Pref. Equity", round: "Seed", investmentCost: 8499995, fmv: 8499995, proceeds: 0, moic: "1.00x", twhPercent: "0.31%", twhCost: 26212.03, twhFMV: 26212.03 },
  { company: "Energy Applied, Inc.", fund: "Third Sphere", status: "Active", date: "3-Jun-22", instrument: "SAFE", round: "Seed", investmentCost: 600000, fmv: 150000, proceeds: 0, moic: "0.25x", twhPercent: "4.80%", twhCost: 28800, twhFMV: 7200 },
  { company: "Eve Nexus, Inc.", fund: "Tamarack", status: "Active", date: "2-May-23", instrument: "SAFE", round: "Seed", investmentCost: 500000, fmv: 986572, proceeds: 0, moic: "1.97x", twhPercent: "2.77%", twhCost: 13866.74, twhFMV: 27361.08 },
  { company: "Everstar, Inc.", fund: "Generational", status: "Active", date: "21-Nov-24", instrument: "Pref. Equity", round: "Pre-Seed", investmentCost: 250000, fmv: 249999, proceeds: 0, moic: "1.00x", twhPercent: "17.38%", twhCost: 43438.37, twhFMV: 43438.20 },
  { company: "Figure AI Inc.", fund: "Tamarack", status: "Active", date: "21-Feb-24", instrument: "Pref. Equity", round: "B", investmentCost: 3049998, fmv: 97664656, proceeds: 0, moic: "32.02x", twhPercent: "2.77%", twhCost: 84587.12, twhFMV: 2708266.27 },
  { company: "Fuse Energy Technologies Corp", fund: "Tamarack", status: "Active", date: "23-Aug-24", instrument: "Pref. Equity", round: "A", investmentCost: 6000000, fmv: 10742564, proceeds: 0, moic: "1.79x", twhPercent: "2.77%", twhCost: 166400.89, twhFMV: 297931.48 },
  { company: "General Biological Corporation", fund: "Lowercarbon", status: "Active", date: "23-Sep-24", instrument: "Pref. Equity", round: "Seed", investmentCost: 7500000, fmv: 30240340, proceeds: 0, moic: "4.03x", twhPercent: "0.31%", twhCost: 23118.10, twhFMV: 93273.80 },
  { company: "Impulse Space, Inc.", fund: "Tamarack", status: "Active", date: "5-Dec-23", instrument: "Pref. Equity", round: "A", investmentCost: 5500003, fmv: 17095210, proceeds: 0, moic: "3.11x", twhPercent: "2.77%", twhCost: 152534.02, twhFMV: 473902.78 },
  { company: "Rainmaker Technology Corp.", fund: "Tamarack", status: "Active", date: "12-Jan-24", instrument: "Pref. Equity", round: "A", investmentCost: 4361458, fmv: 5790790, proceeds: 0, moic: "1.33x", twhPercent: "2.77%", twhCost: 120971.48, twhFMV: 160611.91 },
  { company: "Fiado", fund: "Leap", status: "Active", date: "15-Mar-24", instrument: "Pref. Equity", round: "Seed", investmentCost: 1500000, fmv: 1500000, proceeds: 0, moic: "1.00x", twhPercent: "1.93%", twhCost: 28985.51, twhFMV: 28985.51 },
  { company: "Finix", fund: "Leap", status: "Active", date: "10-Feb-23", instrument: "Pref. Equity", round: "B", investmentCost: 3000000, fmv: 3000000, proceeds: 0, moic: "1.00x", twhPercent: "1.93%", twhCost: 57971.01, twhFMV: 57971.01 },
  { company: "Hedral, Inc.", fund: "Lowercarbon", status: "Active", date: "15-Aug-24", instrument: "Pref. Equity", round: "Seed", investmentCost: 5000000, fmv: 5000000, proceeds: 0, moic: "1.00x", twhPercent: "0.31%", twhCost: 15420.87, twhFMV: 15420.87 },
  { company: "Holoclara", fund: "Generational", status: "Active", date: "5-Mar-25", instrument: "Pref. Equity", round: "Pre-Seed", investmentCost: 200000, fmv: 200000, proceeds: 0, moic: "1.00x", twhPercent: "17.38%", twhCost: 34750.69, twhFMV: 34750.69 },
  { company: "Mammoth Climate PBC", fund: "Lowercarbon", status: "Active", date: "10-Jun-23", instrument: "Pref. Equity", round: "A", investmentCost: 7500000, fmv: 7500000, proceeds: 0, moic: "1.00x", twhPercent: "0.31%", twhCost: 23131.30, twhFMV: 23131.30 },
  { company: "Shellworks, Inc.", fund: "Lowercarbon", status: "Active", date: "20-Nov-23", instrument: "Pref. Equity", round: "Seed", investmentCost: 4000000, fmv: 4000000, proceeds: 0, moic: "1.00x", twhPercent: "0.31%", twhCost: 12334.21, twhFMV: 12334.21 },
  { company: "Titan Dynamics", fund: "Cantos", status: "Active", date: "1-Jul-25", instrument: "Pref. Equity", round: "Seed", investmentCost: 1500000, fmv: 1500000, proceeds: 0, moic: "1.00x", twhPercent: "5.71%", twhCost: 85714.29, twhFMV: 85714.29 },
  { company: "Emerald AI, Inc.", fund: "Cantos", status: "Active", date: "15-Aug-25", instrument: "SAFE", round: "Seed", investmentCost: 500000, fmv: 500000, proceeds: 0, moic: "1.00x", twhPercent: "5.71%", twhCost: 28571.43, twhFMV: 28571.43 },
];

// Portfolio commentary (from "Portfolio Comments" tab)
export const portfolioComments: PortfolioComment[] = [
  { company: "101OBEX, CORP", description: "101OBEX offers a comprehensive full-stack API platform designed to accelerate the development of core banking and fintech solutions. Their platform provides a suite of APIs and development tools that enable companies to build scalable and efficient financial services applications.", targetMarket: "Financial institutions, fintech startups, and developers seeking to create or enhance financial services applications.", tailwinds: "", challenges: "" },
  { company: "Agrippa", description: "Agrippa is a sustainable logistics company focused on commercial freight shipping through underutilized inland and coastal waterways. Their core product, a small cargo ship optimized for these routes, reduces emissions by 50% while providing faster and cheaper transport.", targetMarket: "Commercial freight customers", tailwinds: "", challenges: "" },
  { company: "Air Company Holdings, Inc.", description: "Air Company transforms captured CO₂ into sustainable products like alcohol and fuel, creating a circular economy for carbon.", targetMarket: "Consumer brands, fuel industries, sustainability-focused companies", tailwinds: "", challenges: "" },
  { company: "Airloom Energy, Inc.", description: "Airloom Energy develops wind energy airframes as an alternative energy source, capitalizing on limitations of conventional wind turbines. Their airframes use a unique geometry with small, adjustable sails that are lighter and less expensive.", targetMarket: "Utility companies and large-scale energy providers", tailwinds: "Growing demand for satellite and defense operations in space; strong governmental partnerships.", challenges: "High cost and technical complexity in space transportation; regulatory and operational hurdles." },
  { company: "Around", description: "Around operates Mexico's largest network of dedicated workspaces, offering an asset-light, subscription-based model for startups and small businesses.", targetMarket: "Startups and small businesses in Mexico", tailwinds: "Rising global focus on secure, reliable communication in critical sectors.", challenges: "Complex military and critical infrastructure integration; intense competition." },
  { company: "Beam Tech Inc.", description: "FocalHeat develops advanced electric infrared heating panels designed to decarbonize building heat quickly and affordably. Their technology emits radiant heat directly, warming people and objects rather than just the air.", targetMarket: "Commercial property owners and managers—offices, schools, hospitals, and retail spaces.", tailwinds: "Rising demand for sustainable, clean energy solutions; increased investment in fusion tech.", challenges: "Significant technological hurdles; high R&D costs." },
  { company: "Blue Energy Global Inc.", description: "Blue Energy makes nuclear energy cheaper and faster to build by creating modular power plants for small nuclear reactors using shipyard manufacturing techniques.", targetMarket: "Industrial sectors and large-scale energy consumers seeking reliable, low-carbon power.", tailwinds: "Labor shortages in logistics; partnerships with tech giants like Microsoft and NVIDIA.", challenges: "High development costs for robotics; market skepticism around autonomous robots." },
  { company: "BRK Health Solutions", description: "Operates Clivi, a digital clinic in Mexico offering personalized weight and glucose management programs (obesity and diabetes). Combines medical specialists with treatments, lab monitoring, and real-time WhatsApp support.", targetMarket: "Individuals managing obesity, overweight, or type 2 diabetes in Latin America.", tailwinds: "", challenges: "" },
  { company: "CargoKite GmbH", description: "CargoKite develops emission-free, autonomous micro cargo ships powered by wind energy, targeting the $400B ocean shipping industry.", targetMarket: "Shipping companies seeking sustainable and efficient goods transport.", tailwinds: "Increased investment in wildfire prevention; growing interest in remote operation technology.", challenges: "Dependence on unpredictable weather and complex regulatory approvals." },
  { company: "Chaos Industries, Inc.", description: "Chaos Inc. develops advanced technology to help military and critical industries communicate and coordinate better in difficult environments. Their main system, HYDRA, enhances network reliability for land, sea, and air operations.", targetMarket: "Government defense agencies, military organizations, and infrastructure sectors.", tailwinds: "Growing need for water solutions in drought-prone regions.", challenges: "Reliability and public acceptance of cloud seeding; potential regulatory hurdles." },
  { company: "Checksum AI", description: "Checksum AI automates end-to-end software testing by observing real user sessions and automatically generating tests based on actual usage patterns.", targetMarket: "Mid to large-scale software engineering teams, B2B SaaS, e-commerce, fintech.", tailwinds: "Rising pressure to reduce carbon emissions; government incentives for energy efficiency.", challenges: "Retrofit and integration challenges with existing infrastructure; competition." },
  { company: "Cloover Sustainability AB", description: "Cloover is a financial and payment provider focused on the renewable energy sector, allowing partners to offer customers customized financing solutions for solar panels, heat pumps, and other sustainable technologies.", targetMarket: "Companies that specialize in renewable energy solutions and homeowners.", tailwinds: "Growing demand for sustainable packaging; legislative pressures to reduce plastic waste.", challenges: "Scaling biodegradable materials production; price sensitivity." },
  { company: "Coronal Technologies, Inc.", description: "Specializes in plasma arc additive manufacturing to produce high-performance components from superalloys for aerospace, defense, marine, and energy.", targetMarket: "Aerospace, defense, marine, and energy companies.", tailwinds: "Rising demand for clean energy metals; AI-driven efficiency.", challenges: "High costs associated with AI-driven geological exploration; volatile commodity markets." },
  { company: "Crux Climate, Inc.", description: "Crux is a fintech company with a platform for buying, selling, and managing transferable clean energy tax credits, driven by the Inflation Reduction Act.", targetMarket: "Clean energy developers, tax credit buyers, and financial institutions.", tailwinds: "Growing consumer interest in reducing emissions; increasing government support.", challenges: "Market resistance to appliance electrification; fluctuating government incentives." },
  { company: "Cubbo", description: "Cubbo fulfills e-commerce orders for direct-to-consumer brands in Latin America, operating an urban warehouse fulfillment network enabling same-day delivery.", targetMarket: "Direct-to-consumer brands in Latin America.", tailwinds: "Surge in climate-focused funding and grants.", challenges: "Intense competition in climate tech; dependency on governmental policies." },
  { company: "Diraq", description: "Developing silicon-based quantum processors leveraging CMOS fabrication, offering scalability advantages over competing qubit architectures.", targetMarket: "Quantum researchers, national labs, cloud computing providers, semiconductor companies.", tailwinds: "", challenges: "" },
  { company: "Earth AI, Inc.", description: "Earth AI is a high-performance explorer specializing in the discovery of clean energy metals by integrating AI with fundamental geology to identify untapped critical metal deposits.", targetMarket: "Mining companies, renewable energy industries, tech manufacturers.", tailwinds: "Rising demand for sustainable materials; increasing focus on carbon utilization.", challenges: "Cost competitiveness of CO₂-derived products; limited consumer awareness." },
  { company: "Earth Force Technologies, Inc.", description: "Earth Force mitigates catastrophic wildfires through advanced vegetation management systems, integrating teleoperated machinery, jobsite connectivity, and digital tools.", targetMarket: "Organizations involved in wildfire prevention.", tailwinds: "Rising urgency to address climate change; growing corporate interest in carbon offset.", challenges: "High cost of direct air capture technology; scalability challenges." },
  { company: "Earth XYZ, Inc.", description: "EARTH provides hyperspectral imaging and analysis of the Earth's surface using a constellation of satellites for mining, agriculture, and government.", targetMarket: "Governments and industries including mining, agriculture, and trading.", tailwinds: "Surge in renewable energy adoption; increasing need for stable energy storage.", challenges: "Reliability and cost of energy storage technology." },
  { company: "Earthmover PBC", description: "Earthmover operates a cloud data platform for scientific data, particularly multidimensional arrays common in climate and weather data.", targetMarket: "Scientific data teams, finance, energy, and defense.", tailwinds: "", challenges: "" },
  { company: "ElectroPhotonic-IC Inc.", description: "Developing integrated electro-photonic chips that enable ultra-fast data transfer and processing for datacenters, AI, and telecom infrastructure.", targetMarket: "Semiconductor fabs, hyperscalers (AWS, Google Cloud, Microsoft), telecom OEMs.", tailwinds: "", challenges: "" },
  { company: "Eli Technologies, Inc.", description: "Eli Technologies streamlines access to rebates, tax credits, and financing for home energy and electrification projects through a contractor-focused platform.", targetMarket: "Contractors and installers in home energy & incentive providers.", tailwinds: "", challenges: "" },
  { company: "Energy Applied, Inc.", description: "Energy Applied develops AI-powered smart battery systems for homes, optimizing energy consumption and enabling participation in energy trading markets.", targetMarket: "Homeowners.", tailwinds: "", challenges: "" },
  { company: "Eve Nexus, Inc.", description: "EVE Nexus is a stealth electric vehicle company focused on revolutionizing the EV industry with advanced technology and innovative production processes.", targetMarket: "Mainstream consumer market similar to other large EV manufacturers.", tailwinds: "", challenges: "" },
  { company: "Everstar, Inc.", description: "Everstar develops AI-driven solutions to accelerate the design, licensing, and construction of nuclear technologies.", targetMarket: "Nuclear reactor developers, national laboratories, fuel fabricators, and utilities.", tailwinds: "", challenges: "" },
  { company: "Fiado", description: "Fiado offers a financial platform tailored for Mexican immigrants in the U.S. and their families in Mexico—money transfers, bill payments, and BNPL.", targetMarket: "Mexican immigrants in the United States and their families in Mexico.", tailwinds: "", challenges: "" },
  { company: "Figure AI Inc.", description: "Figure AI develops AI-powered humanoid robots for manufacturing, logistics, warehousing, and retail. Their Figure 02 robot performs human-like tasks to address labor shortages.", targetMarket: "Manufacturing, logistics, warehousing, and retail.", tailwinds: "", challenges: "" },
  { company: "Finix", description: "Finix enables software platforms to become their own payment processors with embedded, customizable payments infrastructure.", targetMarket: "Vertical SaaS companies, marketplaces, and platforms processing significant payment volumes.", tailwinds: "", challenges: "" },
  { company: "Fuse Energy Technologies Corp", description: "Fuse Energy works to make fusion energy a reality using Magnetized-Liner Inertial Fusion (MagLIF) to compress plasma and trigger fusion reactions.", targetMarket: "Energy providers, governments.", tailwinds: "", challenges: "" },
  { company: "General Biological Corporation", description: "General Biological develops sustainable, low-cost biomanufacturing technologies to produce chemical products from renewable carbohydrates instead of fossil fuels.", targetMarket: "Businesses in the chemicals industry relying on fossil fuels for production.", tailwinds: "", challenges: "" },
  { company: "Hedral, Inc.", description: "Hedral is a tech-enabled construction design firm using advanced geometric algorithms and computational physics to speed up design and reduce material waste.", targetMarket: "Commercial construction firms & government agencies.", tailwinds: "", challenges: "" },
  { company: "Holoclara", description: "Holoclara develops orally available, worm-derived therapies to treat allergic and autoimmune diseases by isolating immunomodulatory molecules.", targetMarket: "Individuals with allergic and autoimmune diseases.", tailwinds: "", challenges: "" },
  { company: "Impulse Space, Inc.", description: "Impulse specializes in in-space transportation—orbital transfer vehicles that help move satellites and payloads to different orbits. Contracts with U.S. Space Force.", targetMarket: "Government and Defense Organizations & Commercial Satellite Operators.", tailwinds: "", challenges: "" },
  { company: "Mammoth Climate PBC", description: "Mammoth Climate develops direct air capture technology to remove CO₂ from the atmosphere.", targetMarket: "Corporations, governments, environmental organizations.", tailwinds: "", challenges: "" },
  { company: "Rainmaker Technology Corporation", description: "Rainmaker uses advanced cloud seeding technology to increase rainfall in areas facing water shortages using weather-resistant drones and weather modeling.", targetMarket: "Agricultural producers, governments.", tailwinds: "", challenges: "" },
  { company: "Shellworks, Inc.", description: "Shellworks creates sustainable alternatives to plastic packaging. Their Vivomer is a biodegradable substance derived from microorganisms that decomposes naturally.", targetMarket: "Cosmetics companies, food brands, eco-friendly product manufacturers.", tailwinds: "", challenges: "" },
  { company: "Titan Dynamics", description: "Titan Dynamics develops disposable 3D-printed drones and deployable drone-printing factories for near-peer and asymmetric warfare.", targetMarket: "Defense agencies, allied military forces, aerospace contractors.", tailwinds: "", challenges: "" },
];

export const portfolioCashFlows = [
  { fund: "101OBEX, CORP", nav: 420000, tvpi: "1.00x", irr: "0.00%" },
  { fund: "Lowercarbon 421.0 Parallel Fund", nav: 670281.50, tvpi: "1.00x", irr: "0.80%" },
  { fund: "Third Sphere Fund IV", nav: 559340, tvpi: "0.75x", irr: "-49.44%" },
  { fund: "Tamarack Global Opportunities II", nav: 1124723, tvpi: "1.07x", irr: "22.71%" },
  { fund: "Generational Partners Fund I", nav: 229265, tvpi: "0.76x", irr: "-79.47%" },
  { fund: "Leap Global Partners Fund II", nav: 211401.63, tvpi: "0.85x", irr: "-98.74%" },
];

// Keep old export for backward compat
export const topUnderlyingHoldings = underlyingPortfolio.slice(0, 8);

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
