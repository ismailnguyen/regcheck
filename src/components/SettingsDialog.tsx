import { useState, useEffect } from "react";
import { Eye, EyeOff, Trash2, TestTube } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getSettings, saveSettings, clearSensitiveData, DEFAULT_INGREDIENT_ENDPOINT } from "@/lib/storage";
import { Switch } from "@/components/ui/switch";
import type { AppSettings } from "@/types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [settings, setSettings] = useState<Partial<AppSettings>>({
    apiKey: "",
    debugMode: false,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (open) {
      const currentSettings = getSettings();
      setSettings(currentSettings);
      setTestResult(null);
    }
  }, [open]);

  const handleSave = () => {
    saveSettings(settings);
    onOpenChange(false);
  };

  const handleTestConnection = async () => {
    if (!settings.apiKey?.trim()) {
      setTestResult({ success: false, message: "API Key is required for testing" });
      return;
    }

    const endpoint = DEFAULT_INGREDIENT_ENDPOINT;

    const testPayload = {
      transaction: {
        scope: {
          name: "Connection Test",
          country: ["United States"],
          topic: [
            {
              name: "COS",
              scopeDetail: {
                usage: ["Baby Cream"],
              },
            },
          ],
        },
        ingredientList: {
          name: "Test",
          list: [
            {
              customerId: "WATER",
              customerName: "WATER",
              idType: "Decernis ID",
              idValue: "6715",
            },
          ],
        },
      },
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey.trim()}`,
      "x-api-key": settings.apiKey.trim(),
    };

    setIsTesting(true);
    setTestResult(null);

    const startedAt = Date.now();

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(testPayload),
      });

      const duration = Date.now() - startedAt;
      const text = await response.text();

      if (!response.ok) {
        let message = `Test failed with status ${response.status}`;
        if (text) {
          try {
            const parsed = JSON.parse(text);
            if (parsed?.message) {
              message = parsed.message;
            }
          } catch {
            // keep default message
          }
        }
        throw new Error(message);
      }

      setTestResult({
        success: true,
        message: `Connection successful (status ${response.status}, ${duration} ms).`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setTestResult({
        success: false,
        message: `Connection failed: ${message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleClearData = () => {
    clearSensitiveData();
    setSettings(prev => ({ ...prev, apiKey: "" }));
    setTestResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key *</Label>
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <Input
                  id="api-key"
                  type={showApiKey ? "text" : "password"}
                  placeholder="Enter your Decernis API key..."
                  value={settings.apiKey || ""}
                  onChange={(e) => setSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Your API key is stored locally in your browser and never transmitted to our servers.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-1">
              <Label htmlFor="debug-mode">Debug mode</Label>
              <p className="text-xs text-muted-foreground">
                Show API request and response details after each validation run.
              </p>
            </div>
            <Switch
              id="debug-mode"
              checked={Boolean(settings.debugMode)}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, debugMode: checked }))}
            />
          </div>

          <div className="flex space-x-2">
            <Button
              onClick={handleTestConnection}
              disabled={!settings.apiKey?.trim() || isTesting}
              variant="outline"
              className="flex-1"
            >
              <TestTube className="w-4 h-4 mr-2" />
              {isTesting ? "Testing..." : "Test Connection"}
            </Button>
            <Button
              onClick={handleClearData}
              variant="outline"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Data
            </Button>
          </div>

          {testResult && (
            <Alert variant={testResult.success ? "default" : "destructive"}>
              <AlertDescription>{testResult.message}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save Settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
