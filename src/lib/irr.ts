import xirr from "xirr";

export type IrrFlow = { amount: number; when: Date };

const parseLocalDate = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

/**
 * Compute XIRR from cash flows.
 * DB convention in cash_flows.amount_usd: contributions stored NEGATIVE, distributions POSITIVE.
 * Pass values straight in. Append terminal NAV as a positive flow on quarter-end.
 */
export function computeXirr(
  cashFlows: { date: string; amount_usd: number }[],
  terminalNav: number,
  terminalDate: string,
): number | null {
  const flows: IrrFlow[] = [];
  for (const cf of cashFlows) {
    const amt = Number(cf.amount_usd);
    if (!amt || !cf.date) continue;
    flows.push({ amount: amt, when: parseLocalDate(cf.date) });
  }
  if (terminalNav > 0 && terminalDate) {
    flows.push({ amount: terminalNav, when: parseLocalDate(terminalDate) });
  }
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos || flows.length < 2) return null;
  try {
    return xirr(flows);
  } catch {
    return null;
  }
}
