import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ResultsTable } from "@/components/ResultsTable";
import { Trash2 } from "lucide-react";
import type { ValidationResultRecord } from "@/types";

interface ValidationHistoryProps {
  records: ValidationResultRecord[];
  selectedRecordId: string | null;
  onSelectRecord: (id: string) => void;
  title?: string;
  onDeleteRecord?: (id: string) => void;
}

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export function ValidationHistory({ records, selectedRecordId, onSelectRecord, title = "Validation Results", onDeleteRecord }: ValidationHistoryProps) {
  const orderedRecords = useMemo(() => {
    return [...records].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [records]);

  const selectedRecord = orderedRecords.find(record => record.id === selectedRecordId) || orderedRecords[0];

  if (orderedRecords.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-12 text-center text-muted-foreground">
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        <p>No validation history yet.</p>
        <p className="text-sm">Run a validation to see past results here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground">{orderedRecords.length} saved run{orderedRecords.length === 1 ? "" : "s"}</span>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="lg:w-72 flex-shrink-0 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Runs</h3>
          <ScrollArea className="h-[360px] rounded-lg border p-2">
            <div className="space-y-2">
              {orderedRecords.map((record) => (
                <div key={record.id} className="flex items-center space-x-2">
                  <Button
                    variant={selectedRecord?.id === record.id ? "default" : "outline"}
                    className="flex-1 justify-start text-left"
                    onClick={() => onSelectRecord(record.id)}
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-semibold truncate w-full">{record.name}</span>
                      <span className="text-xs text-muted-foreground">{formatDate(record.createdAt)}</span>
                    </div>
                  </Button>
                  {onDeleteRecord && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      aria-label={`Delete ${record.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteRecord(record.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <ScrollBar orientation="vertical" />
          </ScrollArea>
        </div>

        {selectedRecord ? (
          <div className="flex-1 space-y-4">
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold">{selectedRecord.name}</h3>
                  <p className="text-xs text-muted-foreground">Run at {formatDate(selectedRecord.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(selectedRecord.summary.countsByIndicator).map(([status, count]) => (
                    <Badge key={status} variant="outline" className="text-xs">
                      {status}: {count}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                {selectedRecord.scenario.countries.length > 0 && (
                  <span>Countries: {selectedRecord.scenario.countries.join(", ")}</span>
                )}
                {selectedRecord.scenario.usages.length > 0 && (
                  <span>Usages: {selectedRecord.scenario.usages.join(", ")}</span>
                )}
                {selectedRecord.scenario.spec && (
                  <span>Specification: {selectedRecord.scenario.spec}</span>
                )}
                <span className="sm:col-span-2">
                  Ingredients: {selectedRecord.scenario.ingredients.length > 0
                    ? selectedRecord.scenario.ingredients.map((ing) => {
                        const parts = [ing.name || ing.idValue || "Unnamed"];
                        if (typeof ing.percentage === "number") {
                          parts.push(`${ing.percentage}%`);
                        }
                        if (ing.function) {
                          parts.push(ing.function);
                        }
                        return parts.join(" • ");
                      }).join(", ")
                    : "None"}
                </span>
              </div>
            </div>

            <ResultsTable data={selectedRecord.results} summary={selectedRecord.summary} />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-lg border bg-card py-12 text-muted-foreground">
            <p>Select a run to see its details.</p>
          </div>
        )}
      </div>
    </div>
  );
}
