import type { Handler } from "@netlify/functions";
import { mergeJobRecord } from "./_shared/job-store";

const ALLOWED_FORWARD_HEADERS = [
  "authorization",
  "x-api-key",
  "x-decernis-organization",
  "x-decernis-environment",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type,authorization,x-api-key,x-decernis-organization,x-decernis-environment",
};

interface StartRequestBody {
  jobId?: string;
  request: {
    endpoint: string;
    method?: string;
    body?: unknown;
  };
  metadata?: Record<string, unknown> | null;
}

const getHeader = (event: Parameters<Handler>[0], name: string): string | undefined => {
  const lower = name.toLowerCase();
  return event.headers?.[lower] ?? event.headers?.[name] ?? undefined;
};

const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Method not allowed" }),
    };
  }

  let body: StartRequestBody;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Invalid JSON payload" }),
    };
  }

  if (!body.request || typeof body.request.endpoint !== "string") {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Request endpoint is required" }),
    };
  }

  const jobId = body.jobId && typeof body.jobId === "string" && body.jobId.trim().length > 0
    ? body.jobId.trim()
    : crypto.randomUUID();

  const method = body.request.method?.toUpperCase?.() ?? "POST";

  await mergeJobRecord(jobId, {
    jobId,
    status: "pending",
    startedAt: new Date().toISOString(),
    request: {
      endpoint: body.request.endpoint,
      method,
      metadata: body.metadata ?? undefined,
    },
    result: undefined,
    error: undefined,
    metrics: undefined,
  });

  const url = new URL(event.rawUrl);
  url.pathname = url.pathname.replace(/\/[\w-]+$/, "/regcheck-background");
  url.search = "";
  url.hash = "";

  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("x-regcheck-job-id", jobId);

  for (const name of ALLOWED_FORWARD_HEADERS) {
    const value = getHeader(event, name);
    if (value) {
      headers.set(name, value);
    }
  }

  const payload = {
    jobId,
    request: {
      endpoint: body.request.endpoint,
      method,
      body: body.request.body ?? null,
    },
    metadata: body.metadata ?? null,
  } satisfies StartRequestBody;

  const backgroundResponse = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!backgroundResponse.ok && backgroundResponse.status !== 202) {
    await mergeJobRecord(jobId, {
      jobId,
      status: "failed",
      error: {
        message: `Failed to enqueue background job (status ${backgroundResponse.status})`,
      },
    });

    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({
        message: "Failed to enqueue background job",
        jobId,
      }),
    };
  }

  return {
    statusCode: 202,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify({ jobId }),
  };
};

export { handler };
