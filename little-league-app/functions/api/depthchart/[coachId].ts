import type { DepthChart } from "../../../src/types";

interface Env {
  DEPTH_CHARTS: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { coachId } = context.params;
  const request = context.request;
  const env = context.env;

  if (!coachId) {
    return new Response("Coach ID is required", { status: 400 });
  }

  const key = `depthchart:${coachId}`;

  try {
    if (request.method === "GET") {
      const data = await env.DEPTH_CHARTS.get(key);
      if (!data) {
        return new Response(null, { status: 404 });
      }
      return new Response(data, {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "POST") {
      const body = (await request.json()) as DepthChart;
      const json = JSON.stringify(body);
      await env.DEPTH_CHARTS.put(key, json);
      return new Response(json, {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (error) {
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return new Response(
      JSON.stringify({ error: message, method: request.method }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
