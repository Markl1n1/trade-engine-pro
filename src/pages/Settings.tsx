import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertCircle } from "lucide-react";

const Settings = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure API keys, environment, and notifications
        </p>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Environment</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="testnet-mode">Testnet Mode</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Trade with fake money on Binance testnet
              </p>
            </div>
            <Switch id="testnet-mode" defaultChecked />
          </div>
          <div className="p-3 bg-warning/10 border border-warning/30 rounded flex gap-2">
            <AlertCircle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
            <p className="text-xs text-warning">
              Currently in TESTNET mode. Switch to mainnet to trade with real funds.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Binance API Keys</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="api-key">API Key</Label>
            <Input
              id="api-key"
              type="password"
              placeholder="Enter your Binance API key"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="api-secret">API Secret</Label>
            <Input
              id="api-secret"
              type="password"
              placeholder="Enter your Binance API secret"
              className="mt-1"
            />
          </div>
          <Button>Save API Keys</Button>
          <p className="text-xs text-muted-foreground">
            Keys are encrypted and stored securely. Never share your API keys.
          </p>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold mb-4">Telegram Notifications</h3>
        <div className="space-y-4">
          <div>
            <Label htmlFor="telegram-bot-token">Bot Token</Label>
            <Input
              id="telegram-bot-token"
              type="password"
              placeholder="Enter Telegram bot token"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="telegram-chat-id">Chat ID</Label>
            <Input
              id="telegram-chat-id"
              placeholder="Enter chat or group ID"
              className="mt-1"
            />
          </div>
          <Button>Save Telegram Settings</Button>
          <p className="text-xs text-muted-foreground">
            Get notified when signals are generated and trades are executed.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default Settings;
