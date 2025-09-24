const FUNCTIONS_BASE = import.meta.env.VITE_REGCHECK_FUNCTIONS_BASE_URL || "/.netlify/functions";

const START_ENDPOINT = `${FUNCTIONS_BASE}/regcheck-start`;
const STATUS_ENDPOINT = `${FUNCTIONS_BASE}/regcheck-status`;

const DEFAULT_POLL_INTERVAL_MS = 1500;
const MAX_POLL_INTERVAL_MS = 5000;
const BACKOFF_FACTOR = 1.4;
const DEFAULT_TIMEOUT_MS = 14 * 60 * 1000; // 14 minutes, keeps margin under Netlify background limit

export const DECERNIS_API_BASE_URL = "https://api.decernis.com";
export const INGREDIENT_ENDPOINT_PATH = "/v5/ingredient-analysis/transaction?report=tabular";
export const RECIPE_ENDPOINT_PATH = "/v5/recipe-analysis/transaction";

export type ValidationJobStatus = "pending" | "running" | "completed" | "failed";

export interface ValidationJobResult {
  status: number;
  statusText?: string;
  body?: unknown;
  rawBody?: string;
  weightBytes?: number;
}

export interface ValidationJobError {
  message: string;
  details?: unknown;
}

export interface ValidationJobRecord {
  jobId: string;
  status: ValidationJobStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  request: {
    endpoint: string;
    method: string;
    metadata?: Record<string, unknown>;
  };
  result?: ValidationJobResult;
  error?: ValidationJobError;
  metrics?: {
    durationMs?: number;
  };
}

export interface RunValidationJobParams {
  endpointPath: string;
  payload: unknown;
  apiKey: string;
  metadata?: Record<string, unknown>;
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const acceptJson = { Accept: "application/json" };

const getStartHeaders = (apiKey: string): Record<string, string> => {
  const trimmed = apiKey.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (trimmed) {
    headers.Authorization = `Bearer ${trimmed}`;
    headers["x-api-key"] = trimmed;
  }

  return headers;
};

export const runValidationJob = async ({
  endpointPath,
  payload,
  apiKey,
  metadata,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
}: RunValidationJobParams): Promise<ValidationJobRecord> => {
  if (!endpointPath) {
    throw new Error("endpointPath is required");
  }

  const jobId = crypto.randomUUID();
  const headers = getStartHeaders(apiKey);

  const startResponse = await fetch(START_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jobId,
      request: {
        endpoint: endpointPath,
        method: "POST",
        body: payload,
      },
      metadata: metadata ?? null,
    }),
  });

  if (!(startResponse.ok || startResponse.status === 202)) {
    const text = await startResponse.text();
    let message = `Failed to start validation job (status ${startResponse.status})`;
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

  let resolvedJobId = jobId;
  try {
    const responseJson = await startResponse.json();
    if (responseJson?.jobId) {
      resolvedJobId = responseJson.jobId;
    }
  } catch {
    // Some deployments may not return a JSON body, fall back to generated jobId
  }

  const startedAt = Date.now();
  let attemptInterval = Math.max(500, pollIntervalMs);

  while (true) {
    if (signal?.aborted) {
      throw Object.assign(new Error("Validation job polling aborted"), { name: "AbortError" });
    }

    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out while waiting for validation job to complete");
    }

    const statusResponse = await fetch(`${STATUS_ENDPOINT}?jobId=${encodeURIComponent(resolvedJobId)}`, {
      method: "GET",
      headers: acceptJson,
    });

    if (statusResponse.status === 404) {
      await delay(attemptInterval);
      attemptInterval = Math.min(MAX_POLL_INTERVAL_MS, attemptInterval * BACKOFF_FACTOR);
      continue;
    }

    if (!statusResponse.ok) {
      const text = await statusResponse.text();
      throw new Error(text || `Unexpected status response (${statusResponse.status})`);
    }

    const record = await statusResponse.json() as ValidationJobRecord;

    if (record.status === "completed" || record.status === "failed") {
      return record;
    }

    await delay(attemptInterval);
    attemptInterval = Math.min(MAX_POLL_INTERVAL_MS, attemptInterval * BACKOFF_FACTOR);
  }
};
