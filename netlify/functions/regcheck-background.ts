import type { Handler } from "@netlify/functions";
import { mergeJobRecord } from "./_shared/job-store";

const API_BASE = "https://api.decernis.com";
const ALLOWED_FORWARD_HEADERS = [
  "authorization",
  "x-api-key",
  "x-decernis-organization",
  "x-decernis-environment",
  "content-type",
];

interface BackgroundRequestBody {
  jobId?: string;
  request?: {
    endpoint?: string;
    method?: string;
    body?: unknown;
  };
  metadata?: Record<string, unknown> | null;
}

const normalizeEndpoint = (endpoint: string): string => {
  if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
    return endpoint;
  }

  const base = API_BASE.endsWith("/") ? API_BASE : `${API_BASE}/`;
  return new URL(endpoint, base).toString();
};

const getHeader = (event: Parameters<Handler>[0], name: string): string | undefined => {
  const lower = name.toLowerCase();
  return event.headers?.[lower] ?? event.headers?.[name];
};

const handler: Handler = async (event) => {
  let body: BackgroundRequestBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch (error) {
    console.error("Background job received invalid JSON", error);
    return { statusCode: 400 };
  }

  const jobId = body.jobId || getHeader(event, "x-regcheck-job-id");
  const endpoint = body.request?.endpoint;

  if (!jobId || !endpoint) {
    console.error("Background job missing jobId or endpoint", { jobId, endpoint });
    return { statusCode: 400 };
  }

  const method = body.request?.method?.toUpperCase?.() ?? "POST";

  await mergeJobRecord(jobId, {
    jobId,
    status: "running",
  });

  const targetUrl = normalizeEndpoint(endpoint);

  const headers = new Headers();
  for (const name of ALLOWED_FORWARD_HEADERS) {
    const value = getHeader(event, name);
    if (value) {
      headers.set(name, value);
    }
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const init: RequestInit = {
    method,
    headers,
  };

  if (
    body.request?.body !== undefined &&
    body.request?.body !== null &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    init.body = JSON.stringify(body.request.body);
  }

  const startedAt = Date.now();

  try {
    const response = await fetch(targetUrl, init);
    const responseText = await response.text();
    const weightBytes = responseText ? Buffer.byteLength(responseText, "utf-8") : undefined;

    let parsedBody: unknown = undefined;
    if (responseText) {
      try {
        parsedBody = JSON.parse(responseText);
      } catch {
        parsedBody = undefined;
      }
    }

    if (!response.ok) {
      const message = typeof parsedBody === "object" && parsedBody && "message" in parsedBody
        ? String((parsedBody as { message: unknown }).message)
        : `Upstream request failed with status ${response.status}`;

      await mergeJobRecord(jobId, {
        jobId,
        status: "failed",
        error: {
          message,
          details: parsedBody ?? responseText ?? null,
        },
        result: {
          status: response.status,
          statusText: response.statusText || undefined,
          rawBody: responseText || undefined,
        },
        metrics: {
          durationMs: Date.now() - startedAt,
        },
      });

      return { statusCode: 200 };
    }

    await mergeJobRecord(jobId, {
      jobId,
      status: "completed",
      result: {
        status: response.status,
        statusText: response.statusText || undefined,
        body: parsedBody ?? undefined,
        rawBody: responseText || undefined,
        weightBytes,
      },
      metrics: {
        durationMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await mergeJobRecord(jobId, {
      jobId,
      status: "failed",
      error: {
        message,
      },
      metrics: {
        durationMs: Date.now() - startedAt,
      },
    });
  }

  return {
    statusCode: 200,
  };
};

export { handler };
