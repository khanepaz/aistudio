export default async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders()
        });
    }

    if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
    }

    try {
        const body = await req.json();
        const action = body.action;

        if (!action) {
            return json({ error: "Missing action" }, 400);
        }

        const apiKey = Netlify.env.get("APIDUCK_API_KEY");

        if (!apiKey) {
            return json({ error: "APIDUCK_API_KEY is not configured" }, 500);
        }

        let url;
        let payload;

        if (action === "models") {
            url = "https://apiduck.servepics.com/v1/models";
        } else if (action === "chat") {
            url = "https://apiduck.servepics.com/v1/chat/completions";
            payload = body.payload;
        } else if (action === "image") {
            url = "https://apiduck.servepics.com/v1/images/generations";
            payload = body.payload;
        } else if (action === "edit") {
            url = "https://apiduck.servepics.com/v1/images/edits";
            payload = body.payload;
        } else {
            return json({ error: "Unknown action" }, 400);
        }

        const options = {
            method: action === "models" ? "GET" : "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`
            }
        };

        if (payload !== undefined) {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(payload);
        }

        const response = await fetch(url, options);
        const text = await response.text();

        return new Response(text, {
            status: response.status,
            headers: {
                ...corsHeaders(),
                "Content-Type": response.headers.get("content-type") || "application/json"
            }
        });

    } catch (error) {
        return json({
            error: "Proxy error",
            message: error.message
        }, 500);
    }
};

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
            ...corsHeaders(),
            "Content-Type": "application/json"
        }
    });
}
