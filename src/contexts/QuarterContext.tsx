import { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import { useAppSettings } from "@/hooks/usePortfolioData";

type Quarter = { quarter: string; date: string };

interface QuarterContextValue {
  /** The quarter currently selected in the global dropdown */
  selectedQuarter: Quarter;
  /** The "official" active quarter from app_settings */
  defaultQuarter: Quarter;
  /** All selectable quarters */
  availableQuarters: Quarter[];
  setSelectedDate: (date: string) => void;
}

const QuarterContext = createContext<QuarterContextValue | null>(null);

const DEFAULT: Quarter = { quarter: "3Q25", date: "2025-09-30" };

function makeQuarter(date: Date): Quarter {
  const qMonth = Math.floor(date.getMonth() / 3) * 3 + 2;
  date.setMonth(qMonth);
  date.setDate(new Date(date.getFullYear(), qMonth + 1, 0).getDate());
  const qNum = Math.floor(qMonth / 3) + 1;
  return {
    quarter: `${qNum}Q${date.getFullYear().toString().slice(2)}`,
    date: date.toISOString().split("T")[0],
  };
}

export function QuarterProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useAppSettings();
  const defaultQuarter = (settings?.active_quarter as Quarter) || DEFAULT;
  const [overrideDate, setOverrideDate] = useState<string | null>(null);

  const availableQuarters = useMemo(() => {
    const quarters: Quarter[] = [];
    // 3 quarters back from the default active quarter
    for (let i = 3; i >= 1; i--) {
      const d = new Date(defaultQuarter.date);
      d.setMonth(d.getMonth() - 3 * i);
      quarters.push(makeQuarter(d));
    }
    // Active quarter
    quarters.push(defaultQuarter);
    // Next quarter
    const nd = new Date(defaultQuarter.date);
    nd.setMonth(nd.getMonth() + 3);
    quarters.push(makeQuarter(nd));
    return quarters;
  }, [defaultQuarter.date]);

  const selectedQuarter = useMemo(() => {
    if (!overrideDate) return defaultQuarter;
    return availableQuarters.find(q => q.date === overrideDate) || defaultQuarter;
  }, [overrideDate, defaultQuarter, availableQuarters]);

  return (
    <QuarterContext.Provider
      value={{
        selectedQuarter,
        defaultQuarter,
        availableQuarters,
        setSelectedDate: setOverrideDate,
      }}
    >
      {children}
    </QuarterContext.Provider>
  );
}

export function useQuarterContext() {
  const ctx = useContext(QuarterContext);
  if (!ctx) throw new Error("useQuarterContext must be inside QuarterProvider");
  return ctx;
}
