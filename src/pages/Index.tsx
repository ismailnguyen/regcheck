import { useState } from "react";
import { RegCheckHeader } from "@/components/RegCheckHeader";
import { ScopeBuilder } from "@/components/ScopeBuilder";
import { IngredientsBuilder } from "@/components/IngredientsBuilder";
import { ResultsTable } from "@/components/ResultsTable";
import { SettingsDialog } from "@/components/SettingsDialog";
import { getSettings, storeIngredient } from "@/lib/storage";
import { toast } from "@/hooks/use-toast";
import type { Country, Usage, IngredientInput, ReportRow, ResultSummary } from "@/types";

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

    setIsRunning(true);
    
    try {
      // Mock API call for demo purposes
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Generate mock results
      const mockResults: ReportRow[] = [];
      const statuses = ['ALLOWED', 'PROHIBITED', 'RESTRICTED', 'LISTED'];
      
      for (const ingredient of ingredients) {
        for (const country of countries) {
          for (const usage of usages) {
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            mockResults.push({
              customerId: ingredient.name,
              customerName: ingredient.name,
              idType: ingredient.idType,
              idValue: ingredient.idValue,
              decernisId: Math.floor(Math.random() * 100000),
              decernisName: ingredient.name.toUpperCase(),
              country,
              usage,
              function: "Colorant",
              resultIndicator: status,
              threshold: status === 'RESTRICTED' ? '0.1%' : null,
              citation: `Regulation ${Math.floor(Math.random() * 1000)}/2023`,
              color: status === 'PROHIBITED' ? '#ef4444' : status === 'RESTRICTED' ? '#f59e0b' : '#10b981',
              comments: {
                nameOnList: ingredient.name,
                functionOnList: "Colorant",
                usageOnList: usage,
                comments: `Listed for ${usage} applications`
              },
              hyperlink: `https://example.com/regulation/${Math.floor(Math.random() * 1000)}`
            });
          }
        }
      }
      
      // Calculate summary
      const summary: ResultSummary = {
        countsByIndicator: {},
        total: mockResults.length
      };
      
      mockResults.forEach(result => {
        summary.countsByIndicator[result.resultIndicator] = 
          (summary.countsByIndicator[result.resultIndicator] || 0) + 1;
      });
      
      // Store ingredients for future autocomplete
      ingredients.forEach(ingredient => {
        storeIngredient(ingredient);
      });
      
      setResults(mockResults);
      setResultsSummary(summary);
      
      toast({
        title: "Validation Complete",
        description: `Found ${mockResults.length} results across ${countries.length} countries and ${usages.length} usages.`,
      });
      
    } catch (error) {
      toast({
        title: "Validation Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
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
