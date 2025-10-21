import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Loader2, Save, AlertCircle, Send, CheckCircle, Shield, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { z } from "zod";
import { TradingPairsManager } from "@/components/TradingPairsManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logSettingsChange, logTradingModeSwitch } from "@/utils/auditLogger";

// Validation schema for security
const settingsSchema = z.object({
  exchange_type: z.enum(['binance', 'bybit']).optional(),
  binance_mainnet_api_key: z.string().trim().max(128, "API key too long").optional(),
  binance_mainnet_api_secret: z.string().trim().max(128, "API secret too long").optional(),
  binance_testnet_api_key: z.string().trim().max(128, "API key too long").optional(),
  binance_testnet_api_secret: z.string().trim().max(128, "API secret too long").optional(),
  bybit_mainnet_api_key: z.string().trim().max(128, "API key too long").optional(),
  bybit_mainnet_api_secret: z.string().trim().max(128, "API secret too long").optional(),
  bybit_testnet_api_key: z.string().trim().max(128, "API key too long").optional(),
  bybit_testnet_api_secret: z.string().trim().max(128, "API secret too long").optional(),
  telegram_bot_token: z.string().trim().max(256, "Token too long").optional(),
  telegram_chat_id: z.string().trim().max(64, "Chat ID too long").optional()
});
interface UserSettings {
  exchange_type: 'binance' | 'bybit';
  binance_mainnet_api_key: string;
  binance_mainnet_api_secret: string;
  binance_testnet_api_key: string;
  binance_testnet_api_secret: string;
  bybit_mainnet_api_key: string;
  bybit_mainnet_api_secret: string;
  bybit_testnet_api_key: string;
  bybit_testnet_api_secret: string;
  use_testnet: boolean;
  telegram_bot_token: string;
  telegram_chat_id: string;
  telegram_enabled: boolean;
  // Trading mode settings
  trading_mode: 'testnet_only' | 'hybrid_safe' | 'hybrid_live' | 'paper_trading' | 'mainnet_only';
  use_mainnet_data: boolean;
  use_testnet_api: boolean;
  paper_trading_mode: boolean;
}
interface AppSettings {
  signalsPerPage: number;
}
interface SystemSettings {
  monitoringEnabled: boolean;
  monitoringInterval: number;
  lastRun: string | null;
}

// Helper functions for trading mode display
const getTradingModeAlertClass = (mode: string) => {
  switch (mode) {
    case 'testnet_only':
      return "bg-blue-50 border-blue-200";
    case 'hybrid_safe':
      return "bg-green-50 border-green-200";
    case 'hybrid_live':
      return "bg-yellow-50 border-yellow-200";
    case 'paper_trading':
      return "bg-purple-50 border-purple-200";
    case 'mainnet_only':
      return "bg-red-50 border-red-200";
    default:
      return "bg-gray-50 border-gray-200";
  }
};
const getTradingModeIconClass = (mode: string) => {
  switch (mode) {
    case 'testnet_only':
      return "text-blue-600";
    case 'hybrid_safe':
      return "text-green-600";
    case 'hybrid_live':
      return "text-yellow-600";
    case 'paper_trading':
      return "text-purple-600";
    case 'mainnet_only':
      return "text-red-600";
    default:
      return "text-gray-600";
  }
};
const getTradingModeDescription = (mode: string) => {
  switch (mode) {
    case 'testnet_only':
      return <>
          <strong>TESTNET ONLY:</strong> Using testnet data and API
          <br />✅ Safe for testing, ❌ Limited accuracy
        </>;
    case 'hybrid_safe':
      return <>
          <strong>HYBRID SAFE:</strong> Real market data + testnet API + paper trading
          <br />✅ High accuracy, ✅ Safe testing, ✅ No real money risk
        </>;
    case 'hybrid_live':
      return <>
          <strong>HYBRID LIVE:</strong> Real market data + testnet API + real execution
          <br />✅ High accuracy, ⚠️ Real money trading, ⚠️ Medium risk
        </>;
    case 'paper_trading':
      return <>
          <strong>PAPER TRADING:</strong> Real market data + no real execution
          <br />✅ High accuracy, ✅ Safe testing, ✅ Perfect for strategy validation
        </>;
    case 'mainnet_only':
      return <>
          <strong>MAINNET ONLY:</strong> Real market data + mainnet API + real execution
          <br />✅ High accuracy, ⚠️ Real money trading, ⚠️ High risk
        </>;
    default:
      return "Select a trading mode to see details";
  }
};
const Settings = () => {
  const {
    toast
  } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testingBinance, setTestingBinance] = useState(false);
  const [activeApiTab, setActiveApiTab] = useState<'mainnet' | 'testnet'>('mainnet');
  const [appSettings, setAppSettings] = useState<AppSettings>({
    signalsPerPage: 10
  });
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    monitoringEnabled: true,
    monitoringInterval: 15,
    lastRun: null
  });
  const [settings, setSettings] = useState<UserSettings>({
    exchange_type: 'binance',
    binance_mainnet_api_key: "",
    binance_mainnet_api_secret: "",
    binance_testnet_api_key: "",
    binance_testnet_api_secret: "",
    bybit_mainnet_api_key: "",
    bybit_mainnet_api_secret: "",
    bybit_testnet_api_key: "",
    bybit_testnet_api_secret: "",
    use_testnet: true,
    telegram_bot_token: "",
    telegram_chat_id: "",
    telegram_enabled: false,
    // Trading mode settings
    trading_mode: 'hybrid_safe',
    use_mainnet_data: true,
    use_testnet_api: true,
    paper_trading_mode: true
  });
  useEffect(() => {
    checkAuthAndLoadSettings();
    loadAppSettings();
  }, []);
  const checkAuthAndLoadSettings = async () => {
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) {
        setIsAuthenticated(false);
        setLoading(false);
        return;
      }
      setIsAuthenticated(true);
      await loadSettings();
    } catch (error) {
      console.error("Error checking auth:", error);
      setLoading(false);
    }
  };
  const loadAppSettings = () => {
    const savedSignalsPerPage = localStorage.getItem('signalsPerPage');
    if (savedSignalsPerPage) {
      setAppSettings(prev => ({
        ...prev,
        signalsPerPage: parseInt(savedSignalsPerPage)
      }));
    }
  };
  const saveAppSettings = () => {
    localStorage.setItem('signalsPerPage', appSettings.signalsPerPage.toString());
    toast({
      title: "Settings Saved",
      description: "Application settings have been saved"
    });
  };
  const loadSettings = async () => {
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) return;
      const {
        data,
        error
      } = await supabase.from("user_settings").select("*").maybeSingle();
      if (error) {
        throw error;
      }
      if (data) {
        setSettings({
          exchange_type: data.exchange_type as 'binance' | 'bybit' || 'binance',
          binance_mainnet_api_key: data.binance_mainnet_api_key || "",
          binance_mainnet_api_secret: data.binance_mainnet_api_secret || "",
          binance_testnet_api_key: data.binance_testnet_api_key || "",
          binance_testnet_api_secret: data.binance_testnet_api_secret || "",
          bybit_mainnet_api_key: data.bybit_mainnet_api_key || "",
          bybit_mainnet_api_secret: data.bybit_mainnet_api_secret || "",
          bybit_testnet_api_key: data.bybit_testnet_api_key || "",
          bybit_testnet_api_secret: data.bybit_testnet_api_secret || "",
          use_testnet: data.use_testnet,
          telegram_bot_token: data.telegram_bot_token || "",
          telegram_chat_id: data.telegram_chat_id || "",
          telegram_enabled: data.telegram_enabled,
          // Trading mode settings
          trading_mode: data.trading_mode as 'testnet_only' | 'hybrid_safe' | 'hybrid_live' | 'paper_trading' | 'mainnet_only' || 'hybrid_safe',
          use_mainnet_data: data.use_mainnet_data ?? true,
          use_testnet_api: data.use_testnet_api ?? true,
          paper_trading_mode: data.paper_trading_mode ?? true
        });
      }

      // Load system settings
      const {
        data: sysSettings
      } = await supabase.from("system_settings").select("*");
      if (sysSettings) {
        const monitoringEnabled = sysSettings.find(s => s.setting_key === 'monitoring_enabled')?.setting_value === 'true';
        const monitoringInterval = parseInt(sysSettings.find(s => s.setting_key === 'monitoring_interval_seconds')?.setting_value || '15');
        const lastRun = sysSettings.find(s => s.setting_key === 'last_monitoring_run')?.setting_value || null;
        setSystemSettings({
          monitoringEnabled,
          monitoringInterval,
          lastRun
        });
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      toast({
        title: "Error",
        description: "Failed to load settings",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const handleSave = async () => {
    if (!isAuthenticated) {
      toast({
        title: "Authentication Required",
        description: "Please log in to save settings",
        variant: "destructive"
      });
      return;
    }
    try {
      // Validate input
      const validationResult = settingsSchema.safeParse({
        exchange_type: settings.exchange_type,
        binance_mainnet_api_key: settings.binance_mainnet_api_key || undefined,
        binance_mainnet_api_secret: settings.binance_mainnet_api_secret || undefined,
        binance_testnet_api_key: settings.binance_testnet_api_key || undefined,
        binance_testnet_api_secret: settings.binance_testnet_api_secret || undefined,
        bybit_mainnet_api_key: settings.bybit_mainnet_api_key || undefined,
        bybit_mainnet_api_secret: settings.bybit_mainnet_api_secret || undefined,
        bybit_testnet_api_key: settings.bybit_testnet_api_key || undefined,
        bybit_testnet_api_secret: settings.bybit_testnet_api_secret || undefined,
        telegram_bot_token: settings.telegram_bot_token || undefined,
        telegram_chat_id: settings.telegram_chat_id || undefined
      });
      if (!validationResult.success) {
        const errorMessage = validationResult.error.errors[0]?.message || "Invalid input";
        toast({
          title: "Validation Error",
          description: errorMessage,
          variant: "destructive"
        });
        return;
      }
      
      // Get current settings for audit log
      const { data: currentSettings } = await supabase
        .from("user_settings")
        .select("*")
        .maybeSingle();
      
      setSaving(true);
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("User not authenticated");
      }
      console.log("Saving settings for user:", user.id.substring(0, 8) + "...");
      const settingsData = {
        user_id: user.id,
        exchange_type: settings.exchange_type,
        binance_mainnet_api_key: settings.binance_mainnet_api_key?.trim() || null,
        binance_mainnet_api_secret: settings.binance_mainnet_api_secret?.trim() || null,
        binance_testnet_api_key: settings.binance_testnet_api_key?.trim() || null,
        binance_testnet_api_secret: settings.binance_testnet_api_secret?.trim() || null,
        bybit_mainnet_api_key: settings.bybit_mainnet_api_key?.trim() || null,
        bybit_mainnet_api_secret: settings.bybit_mainnet_api_secret?.trim() || null,
        bybit_testnet_api_key: settings.bybit_testnet_api_key?.trim() || null,
        bybit_testnet_api_secret: settings.bybit_testnet_api_secret?.trim() || null,
        use_testnet: settings.use_testnet,
        telegram_bot_token: settings.telegram_bot_token?.trim() || null,
        telegram_chat_id: settings.telegram_chat_id?.trim() || null,
        telegram_enabled: settings.telegram_enabled,
        // Trading mode settings
        trading_mode: settings.trading_mode,
        use_mainnet_data: settings.use_mainnet_data,
        use_testnet_api: settings.use_testnet_api,
        paper_trading_mode: settings.paper_trading_mode
      };
      console.log("Settings data prepared:", {
        use_testnet: settings.use_testnet,
        has_mainnet_key: !!settings.binance_mainnet_api_key,
        has_testnet_key: !!settings.binance_testnet_api_key,
        telegram_enabled: settings.telegram_enabled
      });
      const {
        error
      } = await supabase.from("user_settings").upsert(settingsData, {
        onConflict: 'user_id'
      });
      if (error) {
        console.error("Database error:", error);
        throw new Error(`Database error: ${error.message} (Code: ${error.code || 'unknown'})`);
      }
      console.log("Settings saved successfully");
      
      // Log settings change
      if (currentSettings) {
        await logSettingsChange(currentSettings, settingsData);
        
        // Special log for trading mode switch
        if (currentSettings.trading_mode !== settings.trading_mode) {
          await logTradingModeSwitch(currentSettings.trading_mode, settings.trading_mode);
        }
      }
      
      toast({
        title: "Success",
        description: "Settings saved successfully"
      });
    } catch (error: any) {
      console.error("Save settings error:", error);
      let errorMessage = "Failed to save settings";
      if (error.message) {
        errorMessage = error.message;
      }
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };
  const updateSetting = <K extends keyof UserSettings,>(key: K, value: UserSettings[K]) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };
  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('test-telegram', {
        body: {}
      });
      if (error) throw error;
      if (data.success) {
        toast({
          title: "Success",
          description: "Test message sent to Telegram successfully!"
        });
      } else {
        throw new Error(data.error || 'Failed to send test message');
      }
    } catch (error: any) {
      console.error("Error testing Telegram:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send test message",
        variant: "destructive"
      });
    } finally {
      setTestingTelegram(false);
    }
  };
  const handleTestExchange = async (useTestnet: boolean) => {
    setTestingBinance(true);
    try {
      const {
        data,
        error
      } = await supabase.functions.invoke('test-exchange', {
        body: {
          useTestnet,
          exchangeType: settings.exchange_type
        }
      });
      if (error) throw error;
      if (data.success) {
        const exchangeName = settings.exchange_type === 'binance' ? 'Binance' : 'Bybit';
        const networkType = useTestnet ? 'Testnet' : 'Mainnet';
        toast({
          title: "Success",
          description: `Connected to ${exchangeName} ${networkType}! Balance: $${data.data.totalWalletBalance.toFixed(2)}`
        });
      } else {
        throw new Error(data.error || `Failed to connect to ${settings.exchange_type}`);
      }
    } catch (error: any) {
      console.error("Error testing exchange:", error);
      const exchangeName = settings.exchange_type === 'binance' ? 'Binance' : 'Bybit';
      toast({
        title: "Error",
        description: error.message || `Failed to connect to ${exchangeName}`,
        variant: "destructive"
      });
    } finally {
      setTestingBinance(false);
    }
  };
  const handleToggleMonitoring = async (enabled: boolean) => {
    try {
      const {
        error
      } = await supabase.from("system_settings").update({
        setting_value: enabled ? 'true' : 'false'
      }).eq('setting_key', 'monitoring_enabled');
      if (error) throw error;
      setSystemSettings(prev => ({
        ...prev,
        monitoringEnabled: enabled
      }));
      toast({
        title: "Success",
        description: `System monitoring ${enabled ? 'enabled' : 'disabled'}`
      });
    } catch (error: any) {
      console.error("Error toggling monitoring:", error);
      toast({
        title: "Error",
        description: "Failed to update monitoring status",
        variant: "destructive"
      });
    }
  };
  const handleEmergencyStop = async () => {
    try {
      await supabase.from("system_settings").update({
        setting_value: 'false'
      }).eq('setting_key', 'monitoring_enabled');
      setSystemSettings(prev => ({
        ...prev,
        monitoringEnabled: false
      }));
      toast({
        title: "Emergency Stop Activated",
        description: "All system monitoring has been stopped",
        variant: "destructive"
      });
    } catch (error: any) {
      console.error("Emergency stop error:", error);
      toast({
        title: "Error",
        description: "Failed to execute emergency stop",
        variant: "destructive"
      });
    }
  };
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>;
  }
  if (!isAuthenticated) {
    return <div className="max-w-4xl mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You need to be logged in to manage settings. Authentication will be implemented in the next phase.
          </AlertDescription>
        </Alert>
      </div>;
  }
  return <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Configure your trading bot settings and API keys
        </p>
      </div>

      {/* Exchange Selection */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Exchange Selection</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="exchange" className="text-base">Select Exchange</Label>
              <p className="text-sm text-muted-foreground">
                Choose between Binance or Bybit for trading
              </p>
            </div>
            <Select value={settings.exchange_type} onValueChange={(value: 'binance' | 'bybit') => updateSetting('exchange_type', value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="binance">Binance</SelectItem>
                <SelectItem value="bybit">Bybit</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Trading Mode Section */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Trading Mode</h2>
        <div className="space-y-4">
          <div>
            <Label htmlFor="trading-mode" className="text-base">Trading Mode</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Choose your trading mode based on your risk tolerance and testing needs
            </p>
            <Select value={settings.trading_mode || 'hybrid_safe'} onValueChange={(value: string) => updateSetting("trading_mode", value as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Select trading mode" />
              </SelectTrigger>
              <SelectContent className="!bg-background !border-border dark:!bg-gray-800 dark:!text-white">
                <SelectItem value="testnet_only" className="hover:bg-accent">
                  <div className="flex flex-col">
                    <span className="font-medium">Testnet Only</span>
                    <span className="text-xs text-muted-foreground">Safe testing, limited accuracy</span>
                  </div>
                </SelectItem>
                <SelectItem value="hybrid_safe" className="hover:bg-accent">
                  <div className="flex flex-col">
                    <span className="font-medium">Hybrid Safe</span>
                    <span className="text-xs text-muted-foreground">Real data + testnet API + paper trading</span>
                  </div>
                </SelectItem>
                <SelectItem value="hybrid_live" className="hover:bg-accent">
                  <div className="flex flex-col">
                    <span className="font-medium">Hybrid Live</span>
                    <span className="text-xs text-muted-foreground">Real data + testnet API + real execution</span>
                  </div>
                </SelectItem>
                <SelectItem value="paper_trading" className="hover:bg-accent">
                  <div className="flex flex-col">
                    <span className="font-medium">Paper Trading</span>
                    <span className="text-xs text-muted-foreground">Real data, no real execution</span>
                  </div>
                </SelectItem>
                <SelectItem value="mainnet_only" className="hover:bg-accent">
                  <div className="flex flex-col">
                    <span className="font-medium">Mainnet Only</span>
                    <span className="text-xs text-muted-foreground">⚠️ Real money, high risk</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          
          
          {/* Advanced Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="use-mainnet-data" className="text-sm">Use Mainnet Data</Label>
                <p className="text-xs text-muted-foreground">Get accurate market data from mainnet</p>
              </div>
              <Switch id="use-mainnet-data" checked={settings.use_mainnet_data ?? true} onCheckedChange={checked => updateSetting("use_mainnet_data", checked)} />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="use-testnet-api" className="text-sm">Use Testnet API</Label>
                <p className="text-xs text-muted-foreground">Use testnet for API calls (safer)</p>
              </div>
              <Switch id="use-testnet-api" checked={settings.use_testnet_api ?? true} onCheckedChange={checked => updateSetting("use_testnet_api", checked)} />
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="paper-trading" className="text-sm">Paper Trading Mode</Label>
                <p className="text-xs text-muted-foreground">Simulate trades without real execution</p>
              </div>
              <Switch id="paper-trading" checked={settings.paper_trading_mode ?? true} onCheckedChange={checked => updateSetting("paper_trading_mode", checked)} />
            </div>
          </div>
        </div>
      </Card>

      {/* API Keys Section */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-xl font-semibold">{settings.exchange_type === 'binance' ? 'Binance' : 'Bybit'} API Keys</h2>
          <Shield className="h-5 w-5 text-green-500" />
        </div>
        <Alert className="bg-green-500/5 border-green-500/20 mb-4">
          <Shield className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-sm">
            🔒 <strong>Military-Grade Encryption:</strong> Your API keys are encrypted using AES-256 before storage. Separate credentials for testnet and mainnet.
          </AlertDescription>
        </Alert>

        {settings.exchange_type === 'binance' ? <Tabs defaultValue="mainnet" className="w-full" onValueChange={(value) => setActiveApiTab(value as 'mainnet' | 'testnet')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="mainnet">Mainnet API Keys</TabsTrigger>
              <TabsTrigger value="testnet">Testnet API Keys</TabsTrigger>
            </TabsList>
            
            <TabsContent value="mainnet" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="mainnet-api-key">Mainnet API Key</Label>
                <Input id="mainnet-api-key" type="password" placeholder="Enter your Binance mainnet API key" value={settings.binance_mainnet_api_key} onChange={e => updateSetting("binance_mainnet_api_key", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mainnet-api-secret">Mainnet API Secret</Label>
                <Input id="mainnet-api-secret" type="password" placeholder="Enter your Binance mainnet API secret" value={settings.binance_mainnet_api_secret} onChange={e => updateSetting("binance_mainnet_api_secret", e.target.value)} />
              </div>
            </TabsContent>

            <TabsContent value="testnet" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="testnet-api-key">Testnet API Key</Label>
                <Input id="testnet-api-key" type="password" placeholder="Enter your Binance testnet API key" value={settings.binance_testnet_api_key} onChange={e => updateSetting("binance_testnet_api_key", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="testnet-api-secret">Testnet API Secret</Label>
                <Input id="testnet-api-secret" type="password" placeholder="Enter your Binance testnet API secret" value={settings.binance_testnet_api_secret} onChange={e => updateSetting("binance_testnet_api_secret", e.target.value)} />
              </div>
            </TabsContent>
          </Tabs> : <Tabs defaultValue="mainnet" className="w-full" onValueChange={(value) => setActiveApiTab(value as 'mainnet' | 'testnet')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="mainnet">Mainnet API Keys</TabsTrigger>
              <TabsTrigger value="testnet">Testnet API Keys</TabsTrigger>
            </TabsList>
            
            <TabsContent value="mainnet" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="bybit-mainnet-api-key">Mainnet API Key</Label>
                <Input id="bybit-mainnet-api-key" type="password" placeholder="Enter your Bybit mainnet API key" value={settings.bybit_mainnet_api_key} onChange={e => updateSetting("bybit_mainnet_api_key", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bybit-mainnet-api-secret">Mainnet API Secret</Label>
                <Input id="bybit-mainnet-api-secret" type="password" placeholder="Enter your Bybit mainnet API secret" value={settings.bybit_mainnet_api_secret} onChange={e => updateSetting("bybit_mainnet_api_secret", e.target.value)} />
              </div>
            </TabsContent>

            <TabsContent value="testnet" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="bybit-testnet-api-key">Testnet API Key</Label>
                <Input id="bybit-testnet-api-key" type="password" placeholder="Enter your Bybit testnet API key" value={settings.bybit_testnet_api_key} onChange={e => updateSetting("bybit_testnet_api_key", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bybit-testnet-api-secret">Testnet API Secret</Label>
                <Input id="bybit-testnet-api-secret" type="password" placeholder="Enter your Bybit testnet API secret" value={settings.bybit_testnet_api_secret} onChange={e => updateSetting("bybit_testnet_api_secret", e.target.value)} />
              </div>
            </TabsContent>
          </Tabs>}

        <Button variant="outline" onClick={() => handleTestExchange(activeApiTab === 'testnet')} disabled={testingBinance || (activeApiTab === 'testnet' ? settings.exchange_type === 'binance' ? !settings.binance_testnet_api_key || !settings.binance_testnet_api_secret : !settings.bybit_testnet_api_key || !settings.bybit_testnet_api_secret : settings.exchange_type === 'binance' ? !settings.binance_mainnet_api_key || !settings.binance_mainnet_api_secret : !settings.bybit_mainnet_api_key || !settings.bybit_mainnet_api_secret)} className="mt-4">
          {testingBinance ? <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testing {activeApiTab === 'testnet' ? 'Testnet' : 'Mainnet'}...
            </> : <>
              <CheckCircle className="mr-2 h-4 w-4" />
              Test {settings.exchange_type === 'binance' ? 'Binance' : 'Bybit'} {activeApiTab === 'testnet' ? 'Testnet' : 'Mainnet'} Connection
            </>}
        </Button>
      </Card>

      {/* Trading Pairs Section */}
      <TradingPairsManager />

      {/* Telegram Section */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Telegram Notifications</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="telegram" className="text-base">Enable Telegram</Label>
              <p className="text-sm text-muted-foreground">
                Receive trading alerts via Telegram
              </p>
            </div>
            <Switch id="telegram" checked={settings.telegram_enabled} onCheckedChange={checked => updateSetting("telegram_enabled", checked)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bot-token">Bot Token</Label>
            <Input id="bot-token" type="password" placeholder="Enter your Telegram bot token" value={settings.telegram_bot_token} onChange={e => updateSetting("telegram_bot_token", e.target.value)} disabled={!settings.telegram_enabled} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chat-id">Chat ID</Label>
            <Input id="chat-id" placeholder="Enter your Telegram chat ID" value={settings.telegram_chat_id} onChange={e => updateSetting("telegram_chat_id", e.target.value)} disabled={!settings.telegram_enabled} />
          </div>
          <Button variant="outline" onClick={handleTestTelegram} disabled={testingTelegram || !settings.telegram_enabled || !settings.telegram_bot_token || !settings.telegram_chat_id}>
            {testingTelegram ? <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </> : <>
                <Send className="mr-2 h-4 w-4" />
                Send Test Message
              </>}
          </Button>
        </div>
      </Card>

      {/* Application Settings */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Application Settings</h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signals-per-page">Signals Per Page</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Number of strategy signals to display per page in the Dashboard
            </p>
            <select id="signals-per-page" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" value={appSettings.signalsPerPage} onChange={e => setAppSettings(prev => ({
            ...prev,
            signalsPerPage: parseInt(e.target.value)
          }))}>
              <option value="5">5 signals</option>
              <option value="10">10 signals</option>
              <option value="20">20 signals</option>
              <option value="50">50 signals</option>
            </select>
          </div>
          <Button onClick={saveAppSettings}>
            <Save className="mr-2 h-4 w-4" />
            Save Application Settings
          </Button>
        </div>
      </Card>

      {/* System Monitoring (24/7) */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">System Monitoring (24/7)</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Global monitoring control - runs automatically every {systemSettings.monitoringInterval} seconds on the server
        </p>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="monitoring-toggle" className="text-base">Enable System Monitoring</Label>
              <p className="text-sm text-muted-foreground">
                Automatically monitor all active strategies for all users
              </p>
            </div>
            <Switch id="monitoring-toggle" checked={systemSettings.monitoringEnabled} onCheckedChange={handleToggleMonitoring} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>System Status</Label>
              <Badge variant={systemSettings.monitoringEnabled ? "default" : "secondary"}>
                {systemSettings.monitoringEnabled ? "🟢 Active" : "⚫ Inactive"}
              </Badge>
            </div>
            {systemSettings.lastRun && <p className="text-sm text-muted-foreground">
                Last run: {new Date(systemSettings.lastRun).toLocaleString()}
              </p>}
          </div>

          <div className="space-y-2">
            <Label>Monitoring Interval</Label>
            <p className="text-sm text-muted-foreground">
              Every {systemSettings.monitoringInterval} seconds (automated via cron)
            </p>
          </div>

          <Alert className="bg-primary/10 border-primary/30">
            <AlertCircle className="h-4 w-4 text-primary" />
            <AlertDescription className="text-sm">
              <strong>24/7 Autonomous Trading:</strong> The monitoring system runs independently on the server every {systemSettings.monitoringInterval} seconds. It processes ALL active strategies from ALL users automatically, regardless of browser activity.
            </AlertDescription>
          </Alert>

          <Button variant="destructive" onClick={handleEmergencyStop} className="w-full" size="lg">
            <AlertTriangle className="w-5 h-5 mr-2" />
            Emergency Stop All Monitoring
          </Button>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={saving}>
          {saving ? <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </> : <>
              <Save className="mr-2 h-4 w-4" />
              Save Settings
            </>}
        </Button>
      </div>
    </div>;
};
export default Settings;