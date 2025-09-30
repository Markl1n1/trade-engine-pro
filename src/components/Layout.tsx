import { Link, useLocation } from "react-router-dom";
import { Activity, BarChart3, Settings, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();

  const navItems = [
    { path: "/", label: "Dashboard", icon: Activity },
    { path: "/strategies", label: "Strategies", icon: Zap },
    { path: "/backtest", label: "Backtest", icon: BarChart3 },
    { path: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Binance Futures Trader</h1>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <span className="px-2 py-1 bg-warning/20 text-warning rounded">TESTNET</span>
          </div>
        </div>
      </header>

      <nav className="border-b border-border bg-card/50">
        <div className="container mx-auto px-4">
          <div className="flex gap-6">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-2 px-3 py-3 border-b-2 transition-colors",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <main className="flex-1 container mx-auto px-4 py-6">{children}</main>

      <footer className="border-t border-border bg-card/50 py-4">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          Binance Futures Trading Platform · Phase 1
        </div>
      </footer>
    </div>
  );
};

export default Layout;
