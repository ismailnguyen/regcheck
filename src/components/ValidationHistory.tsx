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

const formatDuration = (durationMs?: number): string => {
  if (!Number.isFinite(durationMs)) {
    return "N/A";
  }
  return `${Math.max(0, Number(durationMs)).toFixed(0)} ms`;
};

const formatWeight = (bytes?: number): string => {
  if (!bytes || bytes <= 0) {
    return "N/A";
  }
  const kiloBytes = bytes / 1024;
  const display = kiloBytes < 1 ? `${bytes} B` : `${kiloBytes.toFixed(2)} KB`;
  return `${display} (${bytes} B)`;
};

export function ValidationHistory({ records, selectedRecordId, onSelectRecord, title = "Validation Results", onDeleteRecord }: ValidationHistoryProps) {
  const orderedRecords = useMemo(() => {
    return [...records].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [records]);

  const selectedRecord = orderedRecords.find(record => record.id === selectedRecordId) || orderedRecords[0];
  const selectedMetrics = selectedRecord?.metrics;
  const showPercentageColumn = selectedRecord?.scenario.ingredients.some(
    (ingredient) => typeof ingredient.percentage === 'number' && Number.isFinite(ingredient.percentage),
  ) ?? false;

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

      <div className="flex flex-col gap-6 lg:flex-column">
        <div className="flex-shrink-0 space-y-3">
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
              <div className="grid gap-1 text-sm text-muted-foreground grid-cols-1">
                {selectedRecord.scenario.countries.length > 0 && (
                  <div className="sm:col-span-2 lg:col-span-3 mb-4">
                    <u>Countries:</u> {selectedRecord.scenario.countries.join(", ")}
                    </div>
                )}
                {selectedRecord.scenario.usages.length > 0 && (
                  <div className="sm:col-span-2 lg:col-span-3 mb-4">
                    <u>Usages:</u> {selectedRecord.scenario.usages.join(", ")}
                  </div>
                )}
                {selectedRecord.scenario.spec && (
                  <div><u>Specification:</u> {selectedRecord.scenario.spec}</div>
                )}
                <div className="sm:col-span-2 lg:col-span-3 mb-4">
                  <u>Ingredients:</u> {selectedRecord.scenario.ingredients.length > 0
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
                </div>
                <div className="mt-6 col-span-3 grid gap-1 text-sm text-muted-foreground sm:grid-cols-3 lg:grid-cols-3 border rounded">
                  <u className="col-span-3">Response performance:</u>
                  <span>Response Status: {selectedMetrics ? `${selectedMetrics.status}${selectedMetrics.statusText ? ` (${selectedMetrics.statusText})` : ""}` : "Not captured"}</span>
                  <span>Response Time: {selectedMetrics ? formatDuration(selectedMetrics.durationMs) : "Not captured"}</span>
                  <span>Payload Weight: {selectedMetrics ? formatWeight(selectedMetrics.weightBytes) : "Not captured"}</span>
                </div>
              </div>
            </div>

            <ResultsTable
              data={selectedRecord.results}
              summary={selectedRecord.summary}
              title={selectedRecord.name}
              showPercentage={showPercentageColumn}
            />
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
