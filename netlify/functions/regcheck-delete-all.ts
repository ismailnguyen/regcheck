import type { Handler } from "@netlify/functions";
import { deleteAllJobRecords, initializeJobStoreContext } from "./_shared/job-store";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
    };
  }

  if (event.httpMethod !== "DELETE") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Method not allowed" }),
    };
  }

  initializeJobStoreContext(event);

  const deletedCount = await deleteAllJobRecords();

  return {
    statusCode: 200,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify({ deleted: deletedCount }),
  };
};

export { handler };
