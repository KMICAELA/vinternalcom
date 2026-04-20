import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSelectedQuarter } from "@/contexts/QuarterContext";

const QuarterSelect = () => {
  const { quarters, selected, setSelectedId, loading } = useSelectedQuarter();

  if (loading) {
    return <div className="text-xs text-muted-foreground">Loading quarters…</div>;
  }
  if (!quarters.length) {
    return <div className="text-xs text-muted-foreground">No quarters yet</div>;
  }

  return (
    <Select value={selected?.id ?? ""} onValueChange={setSelectedId}>
      <SelectTrigger className="w-[140px] h-8 text-sm">
        <SelectValue placeholder="Quarter" />
      </SelectTrigger>
      <SelectContent>
        {quarters.map((q) => (
          <SelectItem key={q.id} value={q.id}>
            {q.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default QuarterSelect;
