import { Card } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface Props {
  title: string;
  description: string;
  phase: string;
}

const PlaceholderPage = ({ title, description, phase }: Props) => (
  <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-4">
    <div>
      <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </div>
    <Card className="p-12 bg-card border-border">
      <div className="flex flex-col items-center text-center space-y-3">
        <Construction className="h-8 w-8 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Coming in {phase}</p>
          <p className="text-xs text-muted-foreground max-w-md">
            The database foundation is in place. This tab will be built in the next phase.
          </p>
        </div>
      </div>
    </Card>
  </div>
);

export default PlaceholderPage;
