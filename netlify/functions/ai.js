
export default async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders()
        });
    }

    if (req.method !== "POST") {
        return json({
            error: "Method not allowed"
        }, 405);
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
         * Handle multipart image edit.
         */
        if (contentType.toLowerCase().includes("multipart/form-data")) {
            return await handleMultipartEdit(req, apiKey);
        }

        /*
         * Handle JSON requests.
         */
        const body = await req.json();

        const action = body.action;

        if (!action) {
            return json({
                error: "Missing action"
            }, 400);
        }

        /*
         * Image edit sent as JSON/Base64.
         * Convert it to multipart before sending to ApiDuck.
         */
        if (action === "edit") {
            return await handleJsonEdit(body.payload || {}, apiKey);
        }

        let url;
        let payload;

        if (action === "models") {
            url =
                "https://apiduck.servepics.com/v1/models";
        }

        else if (action === "chat") {
            url =
                "https://apiduck.servepics.com/v1/chat/completions";

            payload = body.payload;
        }

        else if (action === "image") {
            url =
                "https://apiduck.servepics.com/v1/images/generations";

            payload = body.payload;
        }

        else {
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
 * Handle multipart/form-data image edit.
 */
async function handleMultipartEdit(req, apiKey) {

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

        return await sendEditToApiDuck(
            image,
            prompt,
            model,
            apiKey
        );

    } catch (error) {
        return json({
            error: "Multipart edit error",
            message: error.message
        }, 500);
    }
}


/*
 * Handle old JSON/Base64 image edit requests.
 */
async function handleJsonEdit(payload, apiKey) {

    try {
        const imageData = payload.image;
        const prompt = payload.prompt;

        const model =
            payload.model ||
            "grok-imagine-image";

        if (!imageData) {
            return json({
                error: "Image data is missing"
            }, 400);
        }

        if (!prompt) {
            return json({
                error: "Edit prompt is missing"
            }, 400);
        }

        let blob;
        let filename = "image.png";

        /*
         * Convert Data URL to Blob.
         */
        if (typeof imageData === "string" &&
            imageData.startsWith("data:")) {

            const match =
                imageData.match(
                    /^data:([^;]+);base64,(.+)$/
                );

            if (!match) {
                return json({
                    error: "Invalid image data"
                }, 400);
            }

            const mimeType = match[1];
            const base64 = match[2];

            const binary =
                Uint8Array.from(
                    atob(base64),
                    char => char.charCodeAt(0)
                );

            blob =
                new Blob(
                    [binary],
                    { type: mimeType }
                );

            const extension =
                mimeType.split("/")[1] || "png";

            filename =
                `image.${extension}`;

        } else {
            return json({
                error: "Unsupported image format"
            }, 400);
        }

        return await sendEditToApiDuck(
            new File(
                [blob],
                filename,
                {
                    type: blob.type
                }
            ),
            prompt,
            model,
            apiKey
        );

    } catch (error) {
        return json({
            error: "JSON edit error",
            message: error.message
        }, 500);
    }
}


/*
 * Send multipart image edit request to ApiDuck.
 */
async function sendEditToApiDuck(
    image,
    prompt,
    model,
    apiKey
) {

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
}


/*
 * CORS.
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
 * JSON response.
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

