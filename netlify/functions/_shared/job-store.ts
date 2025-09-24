import { getStore } from "@netlify/blobs";

type JobStatus = "pending" | "running" | "completed" | "failed";

export interface JobResult {
  status: number;
  statusText?: string;
  body?: unknown;
  rawBody?: string;
  weightBytes?: number;
}

export interface JobError {
  message: string;
  details?: unknown;
}

export interface JobRecord {
  jobId: string;
  status: JobStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  request: {
    endpoint: string;
    method: string;
    metadata?: Record<string, unknown>;
  };
  result?: JobResult;
  error?: JobError;
  metrics?: {
    durationMs?: number;
  };
}

const STORE_NAME = "regcheck-jobs";

type JsonStore = {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
};

const memoryStore = new Map<string, unknown>();

const createMemoryStore = (): JsonStore => ({
  async getJSON<T>(key: string) {
    return (memoryStore.get(key) as T | undefined) ?? null;
  },
  async setJSON<T>(key: string, value: T) {
    memoryStore.set(key, value);
  },
  async delete(key: string) {
    memoryStore.delete(key);
  },
});

let jobStore: JsonStore | null = null;
let hasLoggedFallbackWarning = false;

const resolveStore = (): JsonStore => {
  if (jobStore) {
    return jobStore;
  }

  try {
    jobStore = getStore({ name: STORE_NAME });
    return jobStore;
  } catch (error) {
    if (!hasLoggedFallbackWarning) {
      const message = error instanceof Error ? error.message : String(error);
      const isMissingEnv = error instanceof Error && error.name === "MissingBlobsEnvironmentError";
      const prefix = "Falling back to in-memory job store";
      const suffix = isMissingEnv
        ? "Netlify Blobs environment variables are not configured. Jobs will reset between runs when using the local dev server."
        : message;
      console.info(`${prefix}: ${suffix}`);
      hasLoggedFallbackWarning = true;
    }
    jobStore = createMemoryStore();
    return jobStore;
  }
};

export const readJobRecord = async (jobId: string): Promise<JobRecord | null> => {
  if (!jobId) {
    return null;
  }
  const store = resolveStore();
  const record = await store.getJSON<JobRecord>(jobId);
  return record ?? null;
};

export const writeJobRecord = async (jobId: string, record: JobRecord): Promise<void> => {
  const store = resolveStore();
  await store.setJSON(jobId, record);
};

export const mergeJobRecord = async (jobId: string, patch: Partial<JobRecord>): Promise<JobRecord> => {
  const existing = (await readJobRecord(jobId)) ?? {
    jobId,
    status: "pending" as JobStatus,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    request: {
      endpoint: "unknown",
      method: "POST",
    },
  } satisfies JobRecord;

  const merged: JobRecord = {
    ...existing,
    ...patch,
    request: {
      ...existing.request,
      ...(patch.request ?? {}),
    },
    metrics: {
      ...existing.metrics,
      ...(patch.metrics ?? {}),
    },
  };

  merged.updatedAt = new Date().toISOString();
  if (merged.status === "completed" || merged.status === "failed") {
    merged.completedAt = merged.completedAt ?? merged.updatedAt;
  }

  await writeJobRecord(jobId, merged);
  return merged;
};

export const deleteJobRecord = async (jobId: string): Promise<void> => {
  const store = resolveStore();
  await store.delete(jobId);
};

export type { JobStatus };
