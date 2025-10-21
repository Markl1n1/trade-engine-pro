import { Link, useLocation } from "react-router-dom";
import { Activity, BarChart3, Settings, Zap, LogOut, RefreshCw, Database, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
const Layout = ({
  children
}: {
  children: React.ReactNode;
}) => {
  const location = useLocation();
  const {
    user,
    signOut,
    refreshSession,
    error
  } = useAuth();
  const { isAdmin } = useUserRole();
  const {
    toast
  } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleSignOut = async () => {
    const {
      error
    } = await signOut();
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error signing out',
        description: error.message
      });
    } else {
      toast({
        title: 'Signed out successfully'
      });
    }
  };
  const handleRefreshSession = async () => {
    setIsRefreshing(true);
    await refreshSession();
    setIsRefreshing(false);
  };
  const navItems = [{
    path: "/",
    label: "Dashboard",
    icon: Activity
  }, {
    path: "/strategies",
    label: "Strategies",
    icon: Zap
  }, {
    path: "/backtest",
    label: "Backtest",
    icon: BarChart3
  }, {
    path: "/data-quality",
    label: "Data Quality",
    icon: Database
  }, {
    path: "/audit-logs",
    label: "Audit Logs",
    icon: FileText
  }, {
    path: "/settings",
    label: "Settings",
    icon: Settings
  }];
  return <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Trade Engine PRO</h1>
          </div>
          <div className="flex items-center gap-3">
            
            {user && <>
                <span className="text-sm text-muted-foreground">{user.email}</span>
                {error && <Button variant="outline" size="sm" onClick={handleRefreshSession} disabled={isRefreshing}>
                    <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                  </Button>}
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </>}
          </div>
        </div>
      </header>

      <nav className="border-b border-border bg-card/50">
        <div className="container mx-auto px-4">
          <div className="flex gap-6">
            {navItems.map(item => {
            // Hide Settings link for non-admin users
            if (item.path === '/settings' && !isAdmin) return null;
            
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return <Link key={item.path} to={item.path} className={cn("flex items-center gap-2 px-3 py-3 border-b-2 transition-colors", isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>;
          })}
          </div>
        </div>
      </nav>

      <main className="flex-1 container mx-auto px-4 py-6">{children}</main>

      <footer className="border-t border-border bg-card/50 py-4">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          Trade Engine PRO · Advanced Trading Platform
        </div>
      </footer>
    </div>;
};
export default Layout;