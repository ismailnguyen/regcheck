import type { Handler } from "@netlify/functions";
import { initializeJobStoreContext, listJobRecords } from "./_shared/job-store";

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

  initializeJobStoreContext(event);

  const jobs = await listJobRecords();

  return {
    statusCode: 200,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify({ jobs }),
  };
};

export { handler };
