import { getStore } from "@netlify/blobs";
import { promises as fs } from "fs";
import * as path from "path";

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
const FALLBACK_FILE_PATH = path.join(process.cwd(), ".netlify", "state", `${STORE_NAME}.json`);

type BlobStore = {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list?: (options?: { prefix?: string }) => AsyncIterable<{ key: string }>;
};

type JsonStore = {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  listKeys(): Promise<string[]>;
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
  async listKeys() {
    return Array.from(memoryStore.keys());
  },
});

const createFileStore = (): JsonStore => {
  const readAll = async (): Promise<Record<string, unknown>> => {
    try {
      const raw = await fs.readFile(FALLBACK_FILE_PATH, "utf8");
      if (!raw) {
        return {};
      }
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
      if (code === "ENOENT") {
        return {};
      }
      throw error;
    }
  };

  const writeAll = async (data: Record<string, unknown>) => {
    await fs.mkdir(path.dirname(FALLBACK_FILE_PATH), { recursive: true });
    await fs.writeFile(FALLBACK_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
  };

  return {
    async getJSON<T>(key: string) {
      const data = await readAll();
      return (data[key] as T | undefined) ?? null;
    },
    async setJSON<T>(key: string, value: T) {
      const data = await readAll();
      data[key] = value;
      await writeAll(data);
    },
    async delete(key: string) {
      const data = await readAll();
      if (key in data) {
        delete data[key];
        await writeAll(data);
      }
    },
    async listKeys() {
      const data = await readAll();
      return Object.keys(data);
    },
  };
};

const createBlobStore = (): JsonStore => {
  const store = getStore({ name: STORE_NAME }) as BlobStore;

  return {
    async getJSON<T>(key: string) {
      return (await store.getJSON<T>(key)) ?? null;
    },
    async setJSON<T>(key: string, value: T) {
      await store.setJSON(key, value);
    },
    async delete(key: string) {
      await store.delete(key);
    },
    async listKeys() {
      const listMethod = store.list?.bind(store);
      if (!listMethod) {
        return [];
      }

      const keys: string[] = [];
      for await (const entry of listMethod()) {
        if (entry && typeof entry.key === "string") {
          keys.push(entry.key);
        }
      }
      return keys;
    },
  };
};

let jobStore: JsonStore | null = null;
let hasLoggedFallbackWarning = false;

const resolveStore = (): JsonStore => {
  if (jobStore) {
    return jobStore;
  }

  try {
    jobStore = createBlobStore();
    return jobStore;
  } catch (error) {
    if (!hasLoggedFallbackWarning) {
      const message = error instanceof Error ? error.message : String(error);
      const isMissingEnv = error instanceof Error && error.name === "MissingBlobsEnvironmentError";
      const prefix = "Falling back to local job store";
      const suffix = isMissingEnv
        ? "Netlify Blobs environment variables are not configured. Jobs will be persisted to .netlify/state during local development."
        : message;
      console.info(`${prefix}: ${suffix}`);
      hasLoggedFallbackWarning = true;
    }

    try {
      jobStore = createFileStore();
      return jobStore;
    } catch (fileError) {
      const reason = fileError instanceof Error ? fileError.message : String(fileError);
      console.warn(`Failed to initialize file-based job store (${reason}). Falling back to in-memory store.`);
      jobStore = createMemoryStore();
      return jobStore;
    }
  }
};

const getTimestamp = (value: string | undefined): number => {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
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

export const listJobRecords = async (): Promise<JobRecord[]> => {
  const store = resolveStore();
  const keys = await store.listKeys();
  if (!keys.length) {
    return [];
  }

  const records: JobRecord[] = [];
  const seen = new Set<string>();

  for (const key of keys) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const record = await store.getJSON<JobRecord>(key);
    if (record) {
      records.push(record);
    }
  }

  return records.sort((a, b) => getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt));
};

export type { JobStatus };
