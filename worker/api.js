const UPSTREAM = "https://apiduck.servepics.com/v1";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return json({}, 204);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    if (!env.APIDUCK_API_KEY) {
      return json({ error: "APIDUCK_API_KEY is not configured." }, 500);
    }

    try {
      const body = await request.json();
      const action = body.action;

      if (action === "models") {
        return proxy(`${UPSTREAM}/models`, "GET", null, env.APIDUCK_API_KEY);
      }

      let path;
      let upstreamBody;

      if (action === "chat") {
        path = "/chat/completions";
        upstreamBody = {
          model: body.model,
          messages: body.messages
        };
      } else if (action === "image") {
        path = "/images/generations";
        upstreamBody = {
          model: body.model || "grok-imagine-image",
          prompt: body.prompt,
          size: body.size || "1024x1024",
          quality: body.quality || "low",
          n: 1,
          response_format: "b64_json"
        };
      } else if (action === "edit") {
        path = "/images/edits";
        upstreamBody = {
          model: body.model || "grok-imagine-image",
          prompt: body.prompt,
          image: {
            url: body.image,
            type: "image_url"
          },
          response_format: "b64_json"
        };
      } else {
        return json({ error: "Unknown action." }, 400);
      }

      return proxy(`${UPSTREAM}${path}`, "POST", upstreamBody, env.APIDUCK_API_KEY);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Unexpected error." }, 500);
    }
  }
};

async function proxy(url, method, body, key) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text || "Upstream returned a non-JSON response." };
  }

  return json(data, response.status);
}
