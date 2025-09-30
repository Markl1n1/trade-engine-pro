import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Loader2, Save, AlertCircle, Send, CheckCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface UserSettings {
  binance_api_key: string;
  binance_api_secret: string;
  use_testnet: boolean;
  telegram_bot_token: string;
  telegram_chat_id: string;
  telegram_enabled: boolean;
}

const Settings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testingBinance, setTestingBinance] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({
    binance_api_key: "",
    binance_api_secret: "",
    use_testnet: true,
    telegram_bot_token: "",
    telegram_chat_id: "",
    telegram_enabled: false,
  });

  useEffect(() => {
    checkAuthAndLoadSettings();
  }, []);

  const checkAuthAndLoadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
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

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (data) {
        setSettings({
          binance_api_key: data.binance_api_key || "",
          binance_api_secret: data.binance_api_secret || "",
          use_testnet: data.use_testnet,
          telegram_bot_token: data.telegram_bot_token || "",
          telegram_chat_id: data.telegram_chat_id || "",
          telegram_enabled: data.telegram_enabled,
        });
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      toast({
        title: "Error",
        description: "Failed to load settings",
        variant: "destructive",
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
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("No user found");
      }

      const { error } = await supabase
        .from("user_settings")
        .upsert({
          user_id: user.id,
          ...settings,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Settings saved successfully",
      });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-telegram', {
        body: {},
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Success",
          description: "Test message sent to Telegram successfully!",
        });
      } else {
        throw new Error(data.error || 'Failed to send test message');
      }
    } catch (error: any) {
      console.error("Error testing Telegram:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to send test message",
        variant: "destructive",
      });
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleTestBinance = async () => {
    setTestingBinance(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-binance', {
        body: {},
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Success",
          description: `Connected to Binance ${data.data.environment}! Balance: $${data.data.totalWalletBalance}`,
        });
      } else {
        throw new Error(data.error || 'Failed to connect to Binance');
      }
    } catch (error: any) {
      console.error("Error testing Binance:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to connect to Binance",
        variant: "destructive",
      });
    } finally {
      setTestingBinance(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You need to be logged in to manage settings. Authentication will be implemented in the next phase.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Configure your trading bot settings and API keys
        </p>
      </div>

      {/* Environment Section */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Environment</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="testnet" className="text-base">Testnet Mode</Label>
              <p className="text-sm text-muted-foreground">
                Use Binance Testnet for safe testing
              </p>
            </div>
            <Switch 
              id="testnet" 
              checked={settings.use_testnet}
              onCheckedChange={(checked) => updateSetting("use_testnet", checked)}
            />
          </div>
          {settings.use_testnet && (
            <div className="p-3 bg-warning/10 border border-warning/30 rounded flex gap-2">
              <AlertCircle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
              <p className="text-xs text-warning">
                Currently in TESTNET mode. Switch to mainnet to trade with real funds.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* API Keys Section */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Binance API Keys</h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <Input 
              id="api-key" 
              type="password" 
              placeholder="Enter your Binance API key"
              value={settings.binance_api_key}
              onChange={(e) => updateSetting("binance_api_key", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-secret">API Secret</Label>
            <Input 
              id="api-secret" 
              type="password" 
              placeholder="Enter your Binance API secret"
              value={settings.binance_api_secret}
              onChange={(e) => updateSetting("binance_api_secret", e.target.value)}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Your API keys are stored securely in the database. Never share them with anyone.
          </p>
          <Button 
            variant="outline" 
            onClick={handleTestBinance}
            disabled={testingBinance || !settings.binance_api_key || !settings.binance_api_secret}
          >
            {testingBinance ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Test Connection
              </>
            )}
          </Button>
        </div>
      </Card>

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
            <Switch 
              id="telegram" 
              checked={settings.telegram_enabled}
              onCheckedChange={(checked) => updateSetting("telegram_enabled", checked)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bot-token">Bot Token</Label>
            <Input 
              id="bot-token" 
              type="password" 
              placeholder="Enter your Telegram bot token"
              value={settings.telegram_bot_token}
              onChange={(e) => updateSetting("telegram_bot_token", e.target.value)}
              disabled={!settings.telegram_enabled}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="chat-id">Chat ID</Label>
            <Input 
              id="chat-id" 
              placeholder="Enter your Telegram chat ID"
              value={settings.telegram_chat_id}
              onChange={(e) => updateSetting("telegram_chat_id", e.target.value)}
              disabled={!settings.telegram_enabled}
            />
          </div>
          <Button 
            variant="outline" 
            onClick={handleTestTelegram}
            disabled={testingTelegram || !settings.telegram_enabled || !settings.telegram_bot_token || !settings.telegram_chat_id}
          >
            {testingTelegram ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Test Message
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button size="lg" onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default Settings;
