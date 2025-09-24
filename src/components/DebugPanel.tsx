import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DebugRequestInfo, DebugResponseInfo } from "@/types";

interface DebugPanelProps {
  request: DebugRequestInfo;
  response?: DebugResponseInfo;
  errorMessage?: string;
  payloadText: string;
  onPayloadTextChange: (value: string) => void;
  payloadError?: string | null;
}

const formatDuration = (durationMs: number): string => {
  if (!Number.isFinite(durationMs)) {
    return "N/A";
  }
  return `${durationMs.toFixed(0)} ms`;
};

const formatWeight = (bytes?: number): string => {
  if (!bytes || bytes <= 0) {
    return "N/A";
  }
  const kiloBytes = bytes / 1024;
  const display = kiloBytes < 1 ? `${bytes} B` : `${kiloBytes.toFixed(2)} KB`;
  return `${display} (${bytes} B)`;
};

const stringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export function DebugPanel({
  request,
  response,
  errorMessage,
  payloadText,
  onPayloadTextChange,
  payloadError,
}: DebugPanelProps) {
  const handlePayloadChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onPayloadTextChange(event.target.value);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Debug Output</CardTitle>
        <Badge variant="secondary">Debug mode</Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Request</h3>
            <div className="text-sm space-y-1">
              <p><span className="font-medium">Method:</span> {request.method}</p>
              <p className="break-words"><span className="font-medium">URL:</span> {request.url}</p>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">JSON Payload</p>
                {payloadError && (
                  <span className="text-xs font-medium text-destructive">{payloadError}</span>
                )}
              </div>
              <Textarea
                value={payloadText}
                onChange={handlePayloadChange}
                className={cn(
                  "min-h-[280px] font-mono text-xs",
                  payloadError ? "border-destructive focus-visible:ring-destructive" : ""
                )}
                spellCheck={false}
              />
              <p className="pt-2 text-xs text-muted-foreground">
                Editing the payload keeps the validation builder in sync.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase text-muted-foreground">Response</h3>
            {response ? (
              <>
                <div className="text-sm space-y-1">
                  <p><span className="font-medium">Status:</span> {response.status}{response.statusText ? ` (${response.statusText})` : ""}</p>
                  <p><span className="font-medium">Response time:</span> {formatDuration(response.durationMs)}</p>
                  <p><span className="font-medium">Response weight:</span> {formatWeight(response.weightBytes)}</p>
                </div>
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">JSON Body</p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs">{stringify(response.body)}</pre>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Run a validation to view the latest response details.
              </p>
            )}
          </section>
        </div>
        {errorMessage && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <span className="font-medium">Error:</span> {errorMessage}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
