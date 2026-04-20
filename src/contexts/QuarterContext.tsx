import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Quarter = {
  id: string;
  label: string;
  fiscal_year: number;
  fiscal_quarter: number;
  quarter_end_date: string;
  status: "draft" | "final";
};

interface QuarterContextValue {
  quarters: Quarter[];
  selected: Quarter | null;
  setSelectedId: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
}

const QuarterContext = createContext<QuarterContextValue | null>(null);

export function QuarterProvider({ children }: { children: ReactNode }) {
  const [quarters, setQuarters] = useState<Quarter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("quarters")
      .select("*")
      .order("quarter_end_date", { ascending: false });
    const list = (data ?? []) as Quarter[];
    setQuarters(list);
    if (list.length && !selectedId) setSelectedId(list[0].id);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const selected = quarters.find((q) => q.id === selectedId) ?? quarters[0] ?? null;

  return (
    <QuarterContext.Provider
      value={{ quarters, selected, setSelectedId, loading, refresh: load }}
    >
      {children}
    </QuarterContext.Provider>
  );
}

export function useSelectedQuarter() {
  const ctx = useContext(QuarterContext);
  if (!ctx) throw new Error("useSelectedQuarter must be used inside QuarterProvider");
  return ctx;
}
