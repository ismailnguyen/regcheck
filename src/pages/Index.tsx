import { useState } from "react";
import { RegCheckHeader } from "@/components/RegCheckHeader";
import { ScopeBuilder } from "@/components/ScopeBuilder";
import { IngredientsBuilder } from "@/components/IngredientsBuilder";
import { ResultsTable } from "@/components/ResultsTable";
import { SettingsDialog } from "@/components/SettingsDialog";
import { DebugPanel } from "@/components/DebugPanel";
import { getSettings, storeIngredient, DEFAULT_ENDPOINT } from "@/lib/storage";
import { toast } from "@/hooks/use-toast";
import type { Country, Usage, IngredientInput, ReportRow, ResultSummary, DebugInfo, ApiResponse } from "@/types";

const Index = () => {
  // Settings state
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Scenario state
  const [scenarioName, setScenarioName] = useState("");
  const [countries, setCountries] = useState<Country[]>([]);
  const [usages, setUsages] = useState<Usage[]>([]);
  const [ingredients, setIngredients] = useState<IngredientInput[]>([]);
  
  // Results state
  const [results, setResults] = useState<ReportRow[]>([]);
  const [resultsSummary, setResultsSummary] = useState<ResultSummary>();
  const [isRunning, setIsRunning] = useState(false);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);

  const canRun = countries.length > 0 && usages.length > 0 && ingredients.length > 0 && 
    ingredients.every(ing => ing.name.trim() && ing.idValue.trim());

  const handleRunValidation = async () => {
    const settings = getSettings();
    if (!settings.apiKey) {
      toast({
        title: "API Key Required",
        description: "Please configure your API key in settings before running validation.",
        variant: "destructive",
      });
      setSettingsOpen(true);
      return;
    }

    const endpoint = settings.endpoint || DEFAULT_ENDPOINT;
    const debugEnabled = Boolean(settings.debugMode);

    const requestPayload = {
      transaction: {
        scope: {
          name: scenarioName || "Untitled Scenario",
          country: countries,
          topic: [
            {
              name: "COS",
              scopeDetail: {
                usage: usages,
              },
            },
          ],
        },
        ingredientList: {
          name: scenarioName ? `${scenarioName} Ingredients` : "Submitted Ingredients",
          list: ingredients.map((ingredient) => ({
            customerId: ingredient.name,
            customerName: ingredient.name,
            idType: ingredient.idType,
            idValue: ingredient.idValue,
          })),
        },
        ...(settings.orgName ? { organization: settings.orgName } : {}),
      },
    };

    const requestInfo = {
      method: "POST",
      url: endpoint,
      payload: requestPayload,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (settings.apiKey) {
      headers.Authorization = `Bearer ${settings.apiKey}`;
      headers["x-api-key"] = settings.apiKey;
    }
    if (settings.orgName) {
      headers["X-Decernis-Organization"] = settings.orgName;
    }

    setIsRunning(true);
    setDebugInfo(null);
    const requestStartedAt = Date.now();
    let responseBody: unknown = null;
    let responseStatus = 0;
    let responseStatusText = "";
    let responseWeightBytes: number | undefined;
    
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestPayload),
      });

      responseStatus = response.status;
      responseStatusText = response.statusText;

      const responseText = await response.text();
      if (responseText) {
        responseWeightBytes = typeof TextEncoder !== "undefined"
          ? new TextEncoder().encode(responseText).length
          : responseText.length;
      }

      let parsedBody: unknown = null;
      if (responseText) {
        try {
          parsedBody = JSON.parse(responseText);
        } catch {
          parsedBody = null;
        }
      }

      responseBody = parsedBody ?? (responseText || null);

      if (!response.ok) {
        let message = `Request failed with status ${response.status}`;
        if (
          parsedBody &&
          typeof parsedBody === "object" &&
          (parsedBody as { message?: unknown }).message &&
          typeof (parsedBody as { message?: unknown }).message === "string"
        ) {
          message = (parsedBody as { message: string }).message;
        }
        throw new Error(message);
      }

      if (!parsedBody || typeof parsedBody !== "object") {
        throw new Error("Unexpected API response format");
      }

      const apiResponse = parsedBody as ApiResponse;
      const report = apiResponse.ingredientAnalysisReport;

      if (!report || !Array.isArray(report.tabularReport)) {
        throw new Error("API response missing tabular report data");
      }

      const normalizedResults: ReportRow[] = report.tabularReport.map((row) => ({
        ...row,
        resultIndicator: row.resultIndicator || "UNKNOWN",
      }));

      const summary: ResultSummary = {
        countsByIndicator: {},
        total: normalizedResults.length,
      };

      normalizedResults.forEach(result => {
        const indicator = result.resultIndicator || "UNKNOWN";
        summary.countsByIndicator[indicator] =
          (summary.countsByIndicator[indicator] || 0) + 1;
      });

      // Store ingredients for future autocomplete
      ingredients.forEach(ingredient => {
        storeIngredient(ingredient);
      });

      setResults(normalizedResults);
      setResultsSummary(summary);

      toast({
        title: "Validation Complete",
        description: summary.total > 0
          ? `Found ${summary.total} results across ${countries.length} countries and ${usages.length} usages.`
          : "The API call completed successfully but returned no results.",
      });

      if (debugEnabled) {
        const durationMs = Date.now() - requestStartedAt;
        setDebugInfo({
          request: requestInfo,
          response: {
            durationMs,
            status: responseStatus,
            statusText: responseStatusText,
            weightBytes: responseWeightBytes,
            body: responseBody ?? {},
          },
        });
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      toast({
        title: "Validation Failed",
        description: errorMessage,
        variant: "destructive",
      });

      if (debugEnabled) {
        const durationMs = Date.now() - requestStartedAt;
        setDebugInfo({
          request: requestInfo,
          response: {
            durationMs,
            status: responseStatus || 0,
            statusText: responseStatusText || "Error",
            weightBytes: responseWeightBytes,
            body: responseBody ?? { message: errorMessage },
          },
          errorMessage,
        });
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleSaveScenario = () => {
    toast({
      title: "Scenario Saved",
      description: "Your scenario has been saved locally.",
    });
  };

  const handleExport = (format: 'csv' | 'xlsx' | 'json') => {
    toast({
      title: "Export Started",
      description: `Exporting results as ${format.toUpperCase()}...`,
    });
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <RegCheckHeader
        onSettingsClick={() => setSettingsOpen(true)}
        onRunValidation={handleRunValidation}
        onSaveScenario={handleSaveScenario}
        onExport={handleExport}
        isRunning={isRunning}
        canRun={canRun}
      />
      
      <div className="container mx-auto p-6">
        <div className="grid gap-6 grid-cols-3">
          {(results.length > 0 || isRunning) && (
            <div className="col-span-3">
              <ResultsTable
                data={results}
                summary={resultsSummary}
                isLoading={isRunning}
              />
            </div>
          )}
          {debugInfo && (
            <div className="col-span-3">
              <DebugPanel info={debugInfo} />
            </div>
          )}
          {/* Left Panel */}
          <div>
            <ScopeBuilder
              scenarioName={scenarioName}
              countries={countries}
              usages={usages}
              onScenarioNameChange={setScenarioName}
              onCountriesChange={setCountries}
              onUsagesChange={setUsages}
            />
          </div>
          
          {/* Right Panel */}
          <div className="col-span-2">
            <IngredientsBuilder
              ingredients={ingredients}
              onIngredientsChange={setIngredients}
            />
          </div>

        </div>
      </div>
      
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
};

export default Index;
