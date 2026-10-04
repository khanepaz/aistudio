const UPSTREAM = "https://apiduck.servepics.com/v1";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    if (!env.APIDUCK_API_KEY) {
      return json({ error: "APIDUCK_API_KEY is not configured" }, 500);
    }

    const apiKey = env.APIDUCK_API_KEY;
    const contentType = request.headers.get("content-type") || "";

    try {
      if (contentType.toLowerCase().includes("multipart/form-data")) {
        return await handleMultipartEdit(request, apiKey);
      }

      const body = await request.json();
      const action = body.action;

      if (!action) {
        return json({ error: "Missing action" }, 400);
      }

      const payload = body.payload && typeof body.payload === "object"
        ? body.payload
        : body;

      if (action === "models") {
        return proxy(`${UPSTREAM}/models`, "GET", null, apiKey);
      }

      if (action === "chat") {
        return proxy(`${UPSTREAM}/chat/completions`, "POST", {
          model: payload.model,
          messages: payload.messages
        }, apiKey);
      }

      if (action === "image") {
        return proxy(`${UPSTREAM}/images/generations`, "POST", {
          model: payload.model || "grok-imagine-image",
          prompt: payload.prompt,
          size: payload.size || "1024x1024",
          quality: payload.quality || "low",
          n: payload.n || 1,
          response_format: payload.response_format || "b64_json"
        }, apiKey);
      }

      if (action === "edit") {
        return json({
          error: "برای ویرایش تصویر از FormData (آپلود فایل) استفاده کنید."
        }, 400);
      }

      return json({ error: "Unknown action" }, 400);
    } catch (error) {
      return json({
        error: "Proxy error",
        message: error instanceof Error ? error.message : String(error)
      }, 500);
    }
  }
};

async function handleMultipartEdit(request, apiKey) {
  const form = await request.formData();
  const image = form.get("image");
  const prompt = form.get("prompt");
  const model = form.get("model") || "grok-imagine-image";

  if (!image) return json({ error: "Image file is missing" }, 400);
  if (!prompt) return json({ error: "Edit prompt is missing" }, 400);

  const outbound = new FormData();
  outbound.append("model", model);
  outbound.append("prompt", prompt);
  outbound.append("image", image, image.name || "image.png");

  const response = await fetch(`${UPSTREAM}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: outbound
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      ...corsHeaders(),
      "Content-Type": response.headers.get("content-type") || "application/json"
    }
  });
}

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
  return new Response(text, {
    status: response.status,
    headers: {
      ...corsHeaders(),
      "Content-Type": response.headers.get("content-type") || "application/json"
    }
  });
}
