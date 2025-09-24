import { useEffect, useMemo, useState } from "react";
import { RegCheckHeader } from "@/components/RegCheckHeader";
import { ScopeBuilder } from "@/components/ScopeBuilder";
import { IngredientsBuilder } from "@/components/IngredientsBuilder";
import { RecipeBuilder } from "@/components/RecipeBuilder";
import { ResultsTable } from "@/components/ResultsTable";
import { SettingsDialog } from "@/components/SettingsDialog";
import { DebugPanel } from "@/components/DebugPanel";
import { ValidationHistory } from "@/components/ValidationHistory";
import {
  getSettings,
  storeIngredient,
  DEFAULT_INGREDIENT_ENDPOINT,
  DEFAULT_RECIPE_ENDPOINT,
  getIngredientValidationHistory,
  saveIngredientValidationResult,
  getRecipeValidationHistory,
  saveRecipeValidationResult,
  deleteIngredientValidationResult,
  deleteRecipeValidationResult,
} from "@/lib/storage";
import { toast } from "@/hooks/use-toast";
import type {
  Country,
  Usage,
  IngredientInput,
  RecipeIngredientInput,
  ReportRow,
  ResultSummary,
  DebugInfo,
  ApiResponse,
  ValidationResultRecord,
  IdType,
} from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

const TAB_BUILDER = "builder" as const;
const TAB_HISTORY = "history" as const;

type Mode = "ingredients" | "recipe";
type TabValue = typeof TAB_BUILDER | typeof TAB_HISTORY;

const isValidIdValue = (idType: IdType, value: string): boolean => {
  if (!value.trim()) return false;
  if (idType === "INCI name") return value.trim().length > 0;
  return /^[0-9]+$/.test(value.trim());
};

const Index = () => {
  const [activeMode, setActiveMode] = useState<Mode>("ingredients");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Ingredient builder state
  const [ingredientScenarioName, setIngredientScenarioName] = useState("");
  const [ingredientCountries, setIngredientCountries] = useState<Country[]>([]);
  const [ingredientUsages, setIngredientUsages] = useState<Usage[]>([]);
  const [ingredientItems, setIngredientItems] = useState<IngredientInput[]>([]);

  const [ingredientResults, setIngredientResults] = useState<ReportRow[]>([]);
  const [ingredientSummary, setIngredientSummary] = useState<ResultSummary>();
  const [ingredientIsRunning, setIngredientIsRunning] = useState(false);
  const [ingredientDebugInfo, setIngredientDebugInfo] = useState<DebugInfo | null>(null);
  const [ingredientHistory, setIngredientHistory] = useState<ValidationResultRecord[]>([]);
  const [selectedIngredientHistoryId, setSelectedIngredientHistoryId] = useState<string | null>(null);
  const [ingredientTab, setIngredientTab] = useState<TabValue>(TAB_BUILDER);

  // Recipe builder state
  const [recipeScenarioName, setRecipeScenarioName] = useState("");
  const [recipeCountries, setRecipeCountries] = useState<Country[]>([]);
  const [recipeUsages, setRecipeUsages] = useState<Usage[]>([]);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredientInput[]>([]);
  const [recipeSpec, setRecipeSpec] = useState("");

  const [recipeResults, setRecipeResults] = useState<ReportRow[]>([]);
  const [recipeSummary, setRecipeSummary] = useState<ResultSummary>();
  const [recipeIsRunning, setRecipeIsRunning] = useState(false);
  const [recipeDebugInfo, setRecipeDebugInfo] = useState<DebugInfo | null>(null);
  const [recipeHistory, setRecipeHistory] = useState<ValidationResultRecord[]>([]);
  const [selectedRecipeHistoryId, setSelectedRecipeHistoryId] = useState<string | null>(null);
  const [recipeTab, setRecipeTab] = useState<TabValue>(TAB_BUILDER);

  useEffect(() => {
    const ingredientHistoryData = getIngredientValidationHistory();
    setIngredientHistory(ingredientHistoryData);
    if (ingredientHistoryData.length > 0) {
      setSelectedIngredientHistoryId(ingredientHistoryData[0].id);
    }

    const recipeHistoryData = getRecipeValidationHistory();
    setRecipeHistory(recipeHistoryData);
    if (recipeHistoryData.length > 0) {
      setSelectedRecipeHistoryId(recipeHistoryData[0].id);
    }
  }, []);

  const ingredientCanRun =
    ingredientCountries.length > 0 &&
    ingredientUsages.length > 0 &&
    ingredientItems.length > 0 &&
    ingredientItems.every((ing) => ing.name.trim() && ing.idValue.trim());

  const resetIngredientBuilder = () => {
    setIngredientScenarioName("");
    setIngredientCountries([]);
    setIngredientUsages([]);
    setIngredientItems([]);
    setIngredientResults([]);
    setIngredientSummary(undefined);
    setIngredientDebugInfo(null);
  };

  const recipeTotalPercentage = useMemo(
    () => recipeIngredients.reduce((total, ing) => total + (Number.isFinite(ing.percentage) ? ing.percentage : 0), 0),
    [recipeIngredients]
  );

  const recipeInputsValid = recipeIngredients.every((ing) =>
    ing.name.trim() &&
    ing.idValue.trim() &&
    isValidIdValue(ing.idType, ing.idValue) &&
    Number.isFinite(ing.percentage) &&
    ing.percentage > 0
  );

  const recipeCanRun =
    recipeCountries.length > 0 &&
    recipeUsages.length > 0 &&
    recipeIngredients.length > 0 &&
    recipeInputsValid &&
    recipeTotalPercentage > 0 &&
    recipeTotalPercentage <= 100;

  const resetRecipeBuilder = () => {
    setRecipeScenarioName("");
    setRecipeCountries([]);
    setRecipeUsages([]);
    setRecipeIngredients([]);
    setRecipeSpec("");
    setRecipeResults([]);
    setRecipeSummary(undefined);
    setRecipeDebugInfo(null);
  };

  const runIngredientValidation = async () => {
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

    const endpoint = DEFAULT_INGREDIENT_ENDPOINT;
    const debugEnabled = Boolean(settings.debugMode);

    const requestPayload = {
      transaction: {
        scope: {
          name: ingredientScenarioName || "Untitled Scenario",
          country: ingredientCountries,
          topic: [
            {
              name: "COS",
              scopeDetail: {
                usage: ingredientUsages,
              },
            },
          ],
        },
        ingredientList: {
          name: ingredientScenarioName ? `${ingredientScenarioName} Ingredients` : "Submitted Ingredients",
          list: ingredientItems.map((ingredient) => ({
            customerId: ingredient.name,
            customerName: ingredient.name,
            idType: ingredient.idType,
            idValue: ingredient.idValue,
          })),
        },
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

    setIngredientIsRunning(true);
    setIngredientDebugInfo(null);
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

      ingredientItems.forEach(ingredient => {
        storeIngredient(ingredient);
      });

      setIngredientResults(normalizedResults);
      setIngredientSummary(summary);

      toast({
        title: "Validation Complete",
        description: summary.total > 0
          ? `Found ${summary.total} results across ${ingredientCountries.length} countries and ${ingredientUsages.length} usages.`
          : "The API call completed successfully but returned no results.",
      });

      const recordName = ingredientScenarioName.trim() || `Scenario ${new Date().toLocaleString()}`;
      const record: ValidationResultRecord = {
        id: crypto.randomUUID(),
        name: recordName,
        createdAt: new Date().toISOString(),
        summary: {
          countsByIndicator: { ...summary.countsByIndicator },
          total: summary.total,
        },
        results: normalizedResults,
        scenario: {
          name: ingredientScenarioName.trim() || undefined,
          countries: [...ingredientCountries],
          usages: [...ingredientUsages],
          ingredients: ingredientItems.map((ingredient) => ({ ...ingredient })),
        },
      };

      saveIngredientValidationResult(record);
      setIngredientHistory(prev => [record, ...prev]);
      setSelectedIngredientHistoryId(record.id);

      if (debugEnabled) {
        const durationMs = Date.now() - requestStartedAt;
        setIngredientDebugInfo({
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
        setIngredientDebugInfo({
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
      setIngredientIsRunning(false);
    }
  };

  const runRecipeValidation = async () => {
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

    const endpoint = DEFAULT_RECIPE_ENDPOINT;
    const debugEnabled = Boolean(settings.debugMode);

    const recipeName = recipeScenarioName || "Untitled Recipe";
    const recipeSpecValue = recipeSpec.trim() || recipeName;

    const requestPayload = {
      transaction: {
        scope: {
          name: recipeName,
          country: recipeCountries,
          topic: [
            {
              name: "COS",
              scopeDetail: {
                usage: recipeUsages,
              },
            },
          ],
        },
        recipe: {
          name: recipeName,
          spec: recipeSpecValue,
          ingredients: recipeIngredients.map((ingredient) => {
            const trimmedFunction = ingredient.function?.trim();
            const trimmedSpec = ingredient.spec?.trim();
            return {
              idType: ingredient.idType,
              idValue: ingredient.idValue,
              name: ingredient.name,
              percentage: ingredient.percentage,
              ...(trimmedFunction ? { function: trimmedFunction } : {}),
              ...(trimmedSpec ? { spec: trimmedSpec } : {}),
            };
          }),
        },
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

    setRecipeIsRunning(true);
    setRecipeDebugInfo(null);
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

      const apiResponse = parsedBody as ApiResponse & {
        recipeAnalaysisReport?: {
          recipeReport?: Array<{
            country?: string;
            resultIndicator?: string;
            tabularReport?: ReportRow[];
          }>;
        };
      } & {
        recipeAnalysisReport?: {
          recipeReport?: Array<{
            country?: string;
            resultIndicator?: string;
            tabularReport?: ReportRow[];
          }>;
        };
      };

      const recipeReportContainer = apiResponse.recipeAnalaysisReport || apiResponse.recipeAnalysisReport;
      let normalizedResults: ReportRow[] = [];

      if (recipeReportContainer?.recipeReport && Array.isArray(recipeReportContainer.recipeReport)) {
        normalizedResults = recipeReportContainer.recipeReport.flatMap((entry) => {
          const entryCountry = entry.country || "";
          const entryIndicator = entry.resultIndicator;
          const tabular = Array.isArray(entry.tabularReport) ? entry.tabularReport : [];
          return tabular.map((row) => ({
            ...row,
            country: row.country || entryCountry,
            resultIndicator: row.resultIndicator || entryIndicator || "UNKNOWN",
          }));
        });
      }

      if (normalizedResults.length === 0 && apiResponse.ingredientAnalysisReport?.tabularReport) {
        normalizedResults = apiResponse.ingredientAnalysisReport.tabularReport.map((row) => ({
          ...row,
          resultIndicator: row.resultIndicator || "UNKNOWN",
        }));
      }

      if (normalizedResults.length === 0) {
        throw new Error("API response missing recipe report data");
      }

      const summary: ResultSummary = {
        countsByIndicator: {},
        total: normalizedResults.length,
      };

      normalizedResults.forEach(result => {
        const indicator = result.resultIndicator || "UNKNOWN";
        summary.countsByIndicator[indicator] =
          (summary.countsByIndicator[indicator] || 0) + 1;
      });

      recipeIngredients.forEach(({ percentage: _percentage, function: _function, spec: _spec, ...base }) => {
        storeIngredient(base);
      });

      setRecipeResults(normalizedResults);
      setRecipeSummary(summary);

      toast({
        title: "Recipe Validation Complete",
        description: summary.total > 0
          ? `Found ${summary.total} results across ${recipeCountries.length} countries and ${recipeUsages.length} usages.`
          : "The API call completed successfully but returned no results.",
      });

      const recordName = recipeScenarioName.trim() || `Recipe ${new Date().toLocaleString()}`;
      const record: ValidationResultRecord = {
        id: crypto.randomUUID(),
        name: recordName,
        createdAt: new Date().toISOString(),
        summary: {
          countsByIndicator: { ...summary.countsByIndicator },
          total: summary.total,
        },
        results: normalizedResults,
        scenario: {
          name: recipeScenarioName.trim() || undefined,
          countries: [...recipeCountries],
          usages: [...recipeUsages],
          ingredients: recipeIngredients.map((ingredient) => ({ ...ingredient })),
          spec: recipeSpecValue,
        },
      };

      saveRecipeValidationResult(record);
      setRecipeHistory(prev => [record, ...prev]);
      setSelectedRecipeHistoryId(record.id);

      if (debugEnabled) {
        const durationMs = Date.now() - requestStartedAt;
        setRecipeDebugInfo({
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
        title: "Recipe Validation Failed",
        description: errorMessage,
        variant: "destructive",
      });

      if (debugEnabled) {
        const durationMs = Date.now() - requestStartedAt;
        setRecipeDebugInfo({
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
      setRecipeIsRunning(false);
    }
  };

  const currentIsRunning = activeMode === "ingredients" ? ingredientIsRunning : recipeIsRunning;
  const currentCanRun = activeMode === "ingredients" ? ingredientCanRun : recipeCanRun;
  const currentResults = activeMode === "ingredients" ? ingredientResults : recipeResults;
  const currentSummary = activeMode === "ingredients" ? ingredientSummary : recipeSummary;
  const currentDebugInfo = activeMode === "ingredients" ? ingredientDebugInfo : recipeDebugInfo;
  const currentHistory = activeMode === "ingredients" ? ingredientHistory : recipeHistory;
  const currentSelectedHistoryId = activeMode === "ingredients" ? selectedIngredientHistoryId : selectedRecipeHistoryId;
  const currentTab = activeMode === "ingredients" ? ingredientTab : recipeTab;

  const handleTabChange = (value: string) => {
    const val = value as TabValue;
    if (activeMode === "ingredients") {
      setIngredientTab(val);
    } else {
      setRecipeTab(val);
    }
  };

  const handleHistorySelect = (id: string) => {
    if (activeMode === "ingredients") {
      setSelectedIngredientHistoryId(id);
    } else {
      setSelectedRecipeHistoryId(id);
    }
  };

  const handleIngredientHistoryDelete = (id: string) => {
    deleteIngredientValidationResult(id);
    setIngredientHistory(prev => {
      const updated = prev.filter(record => record.id !== id);
      setSelectedIngredientHistoryId(current => (current === id ? updated[0]?.id ?? null : current));
      return updated;
    });
  };

  const handleRecipeHistoryDelete = (id: string) => {
    deleteRecipeValidationResult(id);
    setRecipeHistory(prev => {
      const updated = prev.filter(record => record.id !== id);
      setSelectedRecipeHistoryId(current => (current === id ? updated[0]?.id ?? null : current));
      return updated;
    });
  };

  const handleDeleteCurrentHistoryRecord = (id: string) => {
    if (activeMode === "ingredients") {
      handleIngredientHistoryDelete(id);
    } else {
      handleRecipeHistoryDelete(id);
    }
  };

  const historyTabLabel = activeMode === "ingredients"
    ? "Ingredients validation results"
    : "Recipe validation results";

  const historyTitle = activeMode === "ingredients"
    ? "Ingredients Validation Results"
    : "Recipe Validation Results";

  const runActiveValidation = () => {
    if (activeMode === "ingredients") {
      void runIngredientValidation();
    } else {
      void runRecipeValidation();
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <RegCheckHeader
        onSettingsClick={() => setSettingsOpen(true)}
        onRunValidation={runActiveValidation}
        isRunning={currentIsRunning}
        canRun={currentCanRun}
        mode={activeMode}
        onModeChange={setActiveMode}
      />
      
      <div className="container mx-auto px-0 py-6">
        <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList>
            <TabsTrigger value={TAB_BUILDER}>Validation Builder</TabsTrigger>
            <TabsTrigger value={TAB_HISTORY}>{historyTabLabel}</TabsTrigger>
          </TabsList>

          <TabsContent value={TAB_BUILDER}>
            <div className="grid gap-6 grid-cols-3">
              {(currentResults.length > 0 || currentIsRunning) && (
                <div className="col-span-3">
                  <ResultsTable
                    data={currentResults}
                    summary={currentSummary}
                    isLoading={currentIsRunning}
                  />
                </div>
              )}
              {currentDebugInfo && (
                <div className="col-span-3">
                  <DebugPanel info={currentDebugInfo} />
                </div>
              )}
              <div>
                <ScopeBuilder
                  scenarioName={activeMode === "ingredients" ? ingredientScenarioName : recipeScenarioName}
                  countries={activeMode === "ingredients" ? ingredientCountries : recipeCountries}
                  usages={activeMode === "ingredients" ? ingredientUsages : recipeUsages}
                  onScenarioNameChange={activeMode === "ingredients" ? setIngredientScenarioName : setRecipeScenarioName}
                  onCountriesChange={activeMode === "ingredients" ? setIngredientCountries : setRecipeCountries}
                  onUsagesChange={activeMode === "ingredients" ? setIngredientUsages : setRecipeUsages}
                />
              </div>
              
              <div className="col-span-2 space-y-4">
                {activeMode === "ingredients" ? (
                  <IngredientsBuilder
                    ingredients={ingredientItems}
                    onIngredientsChange={setIngredientItems}
                  />
                ) : (
                  <RecipeBuilder
                    ingredients={recipeIngredients}
                    recipeSpec={recipeSpec}
                    onRecipeSpecChange={setRecipeSpec}
                    onIngredientsChange={setRecipeIngredients}
                  />
                )}
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={activeMode === "ingredients" ? resetIngredientBuilder : resetRecipeBuilder}
                    disabled={currentIsRunning}
                  >
                    Reset Builder
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value={TAB_HISTORY}>
            <ValidationHistory
              records={currentHistory}
              selectedRecordId={currentSelectedHistoryId}
              onSelectRecord={handleHistorySelect}
              title={historyTitle}
              onDeleteRecord={handleDeleteCurrentHistoryRecord}
            />
          </TabsContent>
        </Tabs>
      </div>
      
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
};

export default Index;
