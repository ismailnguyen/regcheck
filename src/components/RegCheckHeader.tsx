import { Settings, Play, Save, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RegCheckHeaderProps {
  onSettingsClick: () => void;
  onRunValidation: () => void;
  onSaveScenario: () => void;
  onExport: (format: 'csv' | 'xlsx' | 'json') => void;
  isRunning: boolean;
  canRun: boolean;
}

export function RegCheckHeader({
  onSettingsClick,
  onRunValidation,
  onSaveScenario,
  onExport,
  isRunning,
  canRun,
}: RegCheckHeaderProps) {
  return (
    <header className="border-b bg-card px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-primary">RegCheck</h1>
          <span className="text-sm text-muted-foreground">Ingredient Validation Platform</span>
        </div>
        
        <div className="flex items-center space-x-3">
          <Button
            onClick={onRunValidation}
            disabled={!canRun || isRunning}
            className="bg-primary hover:bg-primary/90"
          >
            <Play className="w-4 h-4 mr-2" />
            {isRunning ? "Running..." : "Run Validation"}
          </Button>
          
          {/* <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Save className="w-4 h-4 mr-2" />
                Save/Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onSaveScenario}>
                <Save className="w-4 h-4 mr-2" />
                Save Scenario
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('csv')}>
                <FileDown className="w-4 h-4 mr-2" />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('xlsx')}>
                <FileDown className="w-4 h-4 mr-2" />
                Export Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExport('json')}>
                <FileDown className="w-4 h-4 mr-2" />
                Export JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu> */}
          
          <Button variant="outline" onClick={onSettingsClick}>
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}