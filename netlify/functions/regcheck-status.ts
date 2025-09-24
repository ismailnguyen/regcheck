import type { Handler } from "@netlify/functions";
import { readJobRecord } from "./_shared/job-store";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Method not allowed" }),
    };
  }

  const jobId = event.queryStringParameters?.jobId?.trim();

  if (!jobId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: "jobId query parameter is required" }),
    };
  }

  const record = await readJobRecord(jobId);

  if (!record) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Job not found", jobId }),
    };
  }

  return {
    statusCode: 200,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify(record),
  };
};

export { handler };
