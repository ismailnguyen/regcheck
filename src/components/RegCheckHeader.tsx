import { Settings, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

type ValidationMode = 'ingredients' | 'recipe';

interface RegCheckHeaderProps {
  onSettingsClick: () => void;
  onRunValidation: () => void;
  isRunning: boolean;
  canRun: boolean;
  mode: ValidationMode;
  onModeChange: (mode: ValidationMode) => void;
}

export function RegCheckHeader({
  onSettingsClick,
  onRunValidation,
  isRunning,
  canRun,
  mode,
  onModeChange,
}: RegCheckHeaderProps) {
  return (
    <header className="border-b bg-card px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold">
            <Link
              to="/"
              className="text-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:text-primary/90"
            >
              RegCheck
            </Link>
          </h1>
          <span className="text-sm text-muted-foreground">Compliance Validation Platform</span>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="flex rounded-md border">
            <Button
              type="button"
              variant={mode === 'ingredients' ? 'default' : 'ghost'}
              className={`rounded-none px-4 ${mode === 'ingredients' ? '' : 'text-muted-foreground'}`}
              onClick={() => onModeChange('ingredients')}
            >
              Ingredients
            </Button>
            <Button
              type="button"
              variant={mode === 'recipe' ? 'default' : 'ghost'}
              className={`rounded-none px-4 ${mode === 'recipe' ? '' : 'text-muted-foreground'}`}
              onClick={() => onModeChange('recipe')}
            >
              Recipe
            </Button>
          </div>

          <Button
            onClick={onRunValidation}
            disabled={!canRun || isRunning}
            className="bg-primary hover:bg-primary/90"
          >
            <Play className="w-4 h-4 mr-2" />
            {isRunning ? "Running..." : "Run Validation"}
          </Button>
          
          <Button variant="outline" onClick={onSettingsClick}>
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
