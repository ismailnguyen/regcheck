import type { Handler } from "@netlify/functions";

const API_BASE = "https://api.decernis.com";
const ALLOWED_REQUEST_HEADERS = [
  "authorization",
  "x-api-key",
  "x-decernis-organization",
  "content-type",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": ALLOWED_REQUEST_HEADERS.join(","),
};

const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  try {
    const upstreamPath = event.path.replace(/^\/.netlify\/functions\/decernis-proxy/, "");
    const targetUrl = `${API_BASE}${upstreamPath || ""}${event.rawQuery ? `?${event.rawQuery}` : ""}`;

    const headers = new Headers();
    for (const header of ALLOWED_REQUEST_HEADERS) {
      const value = event.headers[header];
      if (value) {
        headers.set(header, value);
      }
    }

    const init: RequestInit = {
      method: event.httpMethod,
      headers,
    };

    if (event.body && event.httpMethod !== "GET" && event.httpMethod !== "HEAD") {
      const body = event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body;
      init.body = body as BodyInit;
    }

    const response = await fetch(targetUrl, init);
    const contentType = response.headers.get("content-type") || "application/json";
    const text = await response.text();

    return {
      statusCode: response.status,
      headers: {
        ...corsHeaders,
        "content-type": contentType,
      },
      body: text,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      statusCode: 502,
      headers: corsHeaders,
      body: JSON.stringify({ message: `Proxy error: ${message}` }),
    };
  }
};

export { handler };
