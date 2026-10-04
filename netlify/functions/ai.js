
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
        const apiKey = Netlify.env.get("APIDUCK_API_KEY");

        if (!apiKey) {
            return json({
                error: "APIDUCK_API_KEY is not configured"
            }, 500);
        }

        const contentType =
            req.headers.get("content-type") || "";

        /*
         * Image edit uses multipart/form-data.
         */
        if (contentType.includes("multipart/form-data")) {
            return await handleImageEdit(req, apiKey);
        }

        /*
         * Chat and image generation use JSON.
         */
        const body = await req.json();

        const action = body.action;

        if (!action) {
            return json({
                error: "Missing action"
            }, 400);
        }

        let url;
        let payload;

        if (action === "models") {

            url =
                "https://apiduck.servepics.com/v1/models";

        } else if (action === "chat") {

            url =
                "https://apiduck.servepics.com/v1/chat/completions";

            payload = body.payload;

        } else if (action === "image") {

            url =
                "https://apiduck.servepics.com/v1/images/generations";

            payload = body.payload;

        } else if (action === "edit") {

            /*
             * JSON image edit is not supported.
             * The frontend must send multipart/form-data.
             */
            return json({
                error: "Image edit requires multipart/form-data"
            }, 400);

        } else {

            return json({
                error: "Unknown action"
            }, 400);
        }

        const options = {
            method: action === "models"
                ? "GET"
                : "POST",

            headers: {
                "Authorization": `Bearer ${apiKey}`
            }
        };

        if (payload !== undefined) {

            options.headers["Content-Type"] =
                "application/json";

            options.body =
                JSON.stringify(payload);
        }

        const response =
            await fetch(url, options);

        const text =
            await response.text();

        return new Response(text, {
            status: response.status,

            headers: {
                ...corsHeaders(),

                "Content-Type":
                    response.headers.get("content-type") ||
                    "application/json"
            }
        });

    } catch (error) {

        return json({
            error: "Proxy error",
            message: error.message
        }, 500);
    }
};


/*
 * Handle image editing.
 */
async function handleImageEdit(req, apiKey) {

    try {

        const incomingForm =
            await req.formData();

        const image =
            incomingForm.get("image");

        const prompt =
            incomingForm.get("prompt");

        const model =
            incomingForm.get("model") ||
            "grok-imagine-image";

        if (!image) {

            return json({
                error: "Image file is missing"
            }, 400);
        }

        if (!prompt) {

            return json({
                error: "Edit prompt is missing"
            }, 400);
        }

        /*
         * Create a new multipart request
         * for ApiDuck.
         */
        const form =
            new FormData();

        form.append(
            "model",
            model
        );

        form.append(
            "prompt",
            prompt
        );

        form.append(
            "image",
            image,
            image.name || "image.png"
        );

        const response =
            await fetch(
                "https://apiduck.servepics.com/v1/images/edits",
                {
                    method: "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${apiKey}`
                    },

                    body: form
                }
            );

        const text =
            await response.text();

        return new Response(text, {
            status: response.status,

            headers: {
                ...corsHeaders(),

                "Content-Type":
                    response.headers.get("content-type") ||
                    "application/json"
            }
        });

    } catch (error) {

        return json({
            error: "Image edit proxy error",
            message: error.message
        }, 500);
    }
}


/*
 * CORS headers.
 */
function corsHeaders() {

    return {
        "Access-Control-Allow-Origin": "*",

        "Access-Control-Allow-Methods":
            "POST, OPTIONS",

        "Access-Control-Allow-Headers":
            "Content-Type, Authorization"
    };
}


/*
 * JSON response helper.
 */
function json(data, status = 200) {

    return new Response(
        JSON.stringify(data),
        {
            status,

            headers: {
                ...corsHeaders(),

                "Content-Type":
                    "application/json"
            }
        }
    );
}

