import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Quarter {
  id: string;
  label: string;
  sort_order: number;
  is_current: boolean;
}

export interface FundReportStatus {
  id: string;
  quarter_id: string;
  fund_name: string;
  status: "pending" | "uploaded";
  uploaded_at: string | null;
}

export function useQuarters() {
  return useQuery({
    queryKey: ["quarters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quarters")
        .select("*")
        .order("sort_order", { ascending: false });
      if (error) throw error;
      return data as Quarter[];
    },
  });
}

export function useFundReportStatuses(quarterId: string | undefined) {
  return useQuery({
    queryKey: ["fund_report_statuses", quarterId],
    queryFn: async () => {
      if (!quarterId) return [];
      const { data, error } = await supabase
        .from("fund_report_statuses")
        .select("*")
        .eq("quarter_id", quarterId)
        .order("fund_name");
      if (error) throw error;
      return data as FundReportStatus[];
    },
    enabled: !!quarterId,
  });
}

export function useUpdateReportStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "pending" | "uploaded" }) => {
      const { error } = await supabase
        .from("fund_report_statuses")
        .update({ status, uploaded_at: status === "uploaded" ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fund_report_statuses"] });
    },
  });
}

export function useCreateNextQuarter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ label, sortOrder, funds }: { label: string; sortOrder: number; funds: string[] }) => {
      // Set all quarters to not current
      await supabase.from("quarters").update({ is_current: false }).neq("id", "");
      
      // Create new quarter
      const { data: quarter, error: qError } = await supabase
        .from("quarters")
        .insert({ label, sort_order: sortOrder, is_current: true })
        .select()
        .single();
      if (qError) throw qError;

      // Create fund report statuses
      const statuses = funds.map((fund_name) => ({
        quarter_id: quarter.id,
        fund_name,
        status: "pending" as const,
      }));
      const { error: sError } = await supabase.from("fund_report_statuses").insert(statuses);
      if (sError) throw sError;

      return quarter;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quarters"] });
      queryClient.invalidateQueries({ queryKey: ["fund_report_statuses"] });
    },
  });
}

export function getNextQuarterLabel(current: string): string {
  const match = current.match(/Q(\d)\s+(\d{4})/);
  if (!match) return "Q4 2025";
  const q = parseInt(match[1]);
  const y = parseInt(match[2]);
  if (q === 4) return `Q1 ${y + 1}`;
  return `Q${q + 1} ${y}`;
}

export const FUND_NAMES = ["Cantos", "Generational", "Founders Fund", "Leap", "Lowercarbon", "Tamarack", "Direct"];
