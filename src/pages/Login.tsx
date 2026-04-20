import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { lovable } from "@/integrations/lovable/index";
import LogoMark from "@/components/LogoMark";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const Login = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) navigate("/", { replace: true });
  }, [user, loading, navigate]);

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Sign-in failed. Please try again.");
      return;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-8 bg-card border-border">
        <div className="flex flex-col items-center text-center space-y-6">
          <LogoMark size={48} />
          <div>
            <h1 className="text-xl font-semibold text-foreground">TWH-1 Portfolio</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Internal fund operations for TWH Americas Fund I
            </p>
          </div>
          <Button onClick={handleGoogle} className="w-full" size="lg">
            Continue with Google
          </Button>
          <p className="text-xs text-muted-foreground">
            Access is restricted to authorized team members.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default Login;
