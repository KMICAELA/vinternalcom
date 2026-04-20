// Shared financial formatters — locked-in standards
export const fmtUSD = (v: number | null | undefined, opts: { compact?: boolean } = {}) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (opts.compact && Math.abs(v) >= 1_000_000) {
    return `$${(v / 1_000_000).toFixed(1)}M`;
  }
  if (opts.compact && Math.abs(v) >= 1_000) {
    return `$${(v / 1_000).toFixed(1)}K`;
  }
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
};

export const fmtPct = (v: number | null | undefined, decimals = 1) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(decimals)}%`;
};

export const fmtMultiple = (v: number | null | undefined) => {
  if (v === null || v === undefined || Number.isNaN(v) || !isFinite(v)) return "—";
  return `${v.toFixed(2)}x`;
};

export const fmtDate = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

// MOIC = (FMV + Proceeds) / Cost
export const calcMoic = (cost: number, fmv: number, proceeds: number): number | null => {
  if (!cost || cost === 0) return null;
  return (fmv + proceeds) / cost;
};

// DPI = Distributions / Contributions
export const calcDpi = (contrib: number, distrib: number): number | null => {
  if (!contrib || contrib === 0) return null;
  return distrib / contrib;
};

// TVPI = (NAV + Distributions) / Contributions
export const calcTvpi = (contrib: number, distrib: number, nav: number): number | null => {
  if (!contrib || contrib === 0) return null;
  return (nav + distrib) / contrib;
};

// Color class for signed numbers
export const signClass = (v: number | null | undefined) => {
  if (v === null || v === undefined) return "";
  if (v < 0) return "text-destructive";
  return "";
};
