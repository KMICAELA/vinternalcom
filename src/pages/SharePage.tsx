import { Card } from "@/components/ui/card";
import LogoMark from "@/components/LogoMark";

const SharePage = () => (
  <div className="min-h-screen bg-background flex items-center justify-center px-4">
    <Card className="max-w-md p-8 bg-card border-border text-center space-y-4">
      <div className="flex justify-center"><LogoMark size={40} /></div>
      <h1 className="text-lg font-semibold text-foreground">LP Share View</h1>
      <p className="text-sm text-muted-foreground">
        This read-only quarterly view will be available in a future phase.
      </p>
    </Card>
  </div>
);

export default SharePage;
