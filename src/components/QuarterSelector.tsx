import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Quarter } from "@/hooks/useQuarters";

interface QuarterSelectorProps {
  quarters: Quarter[];
  selectedId: string;
  onSelect: (id: string) => void;
}

const QuarterSelector = ({ quarters, selectedId, onSelect }: QuarterSelectorProps) => {
  return (
    <Select value={selectedId} onValueChange={onSelect}>
      <SelectTrigger className="w-[140px] bg-card border-border text-sm">
        <SelectValue placeholder="Select quarter" />
      </SelectTrigger>
      <SelectContent>
        {quarters.map((q) => (
          <SelectItem key={q.id} value={q.id}>
            {q.label}
            {q.is_current && " (Latest)"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default QuarterSelector;
