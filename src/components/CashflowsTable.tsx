import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/calcEngine";

interface CashflowRow {
  id: string;
  cashflow_date: string;
  type: string;
  amount: number;
  description: string | null;
  portfolio_name: string | null;
}

const CashflowsTable = ({ data }: { data: CashflowRow[] }) => {
  const sorted = [...data].sort((a, b) => a.cashflow_date.localeCompare(b.cashflow_date));
  let cumulative = 0;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-2 hover:bg-surface-2">
            <TableHead className="text-muted-foreground text-xs">Date</TableHead>
            <TableHead className="text-muted-foreground text-xs">Type</TableHead>
            <TableHead className="text-muted-foreground text-xs">Description</TableHead>
            <TableHead className="text-muted-foreground text-xs text-right">Amount</TableHead>
            <TableHead className="text-muted-foreground text-xs text-right">Cumulative</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => {
            cumulative += Number(row.amount);
            return (
              <TableRow key={row.id} className="table-row-hover">
                <TableCell className="font-mono text-sm">{row.cashflow_date}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded ${row.type === 'capital_call' ? 'bg-negative/10 text-negative' : 'bg-positive/10 text-positive'}`}>
                    {row.type === 'capital_call' ? 'Capital Call' : 'Distribution'}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{row.description || "—"}</TableCell>
                <TableCell className="text-right font-mono text-sm">{formatCurrency(Number(row.amount))}</TableCell>
                <TableCell className="text-right font-mono text-sm text-foreground">{formatCurrency(cumulative)}</TableCell>
              </TableRow>
            );
          })}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No LP cashflows recorded</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default CashflowsTable;
