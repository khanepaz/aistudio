
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

        if (
            contentType
                .toLowerCase()
                .includes("multipart/form-data")
        ) {
            return await handleMultipartEdit(
                req,
                apiKey
            );
        }

        const body =
            await req.json();

        const action =
            body.action;

        if (!action) {
            return json({
                error: "Missing action"
            }, 400);
        }

        if (action === "edit") {
            return await handleJsonEdit(
                body.payload || {},
                apiKey
            );
        }

        if (action === "models") {
            return await proxyGet(
                "https://apiduck.servepics.com/v1/models",
                apiKey
            );
        }

        if (action === "chat") {
            return await proxyJson(
                "https://apiduck.servepics.com/v1/chat/completions",
                body.payload,
                apiKey
            );
        }

        if (action === "image") {
            return await proxyJson(
                "https://apiduck.servepics.com/v1/images/generations",
                body.payload,
                apiKey
            );
        }

        if (action === "imageModels") {
            return await getImageModels(apiKey);
        }

        return json({
            error: "Unknown action"
        }, 400);

    } catch (error) {
        return json({
            error: "Proxy error",
            message: error.message
        }, 500);
    }
};


/*
 * Proxy GET request.
 */
async function proxyGet(
    url,
    apiKey
) {
    const response =
        await fetch(url, {
            method: "GET",
            headers: {
                "Authorization":
                    `Bearer ${apiKey}`
            }
        });

    const text =
        await response.text();

    return new Response(
        text,
        {
            status: response.status,
            headers: {
                ...corsHeaders(),
                "Content-Type":
                    response.headers.get(
                        "content-type"
                    ) ||
                    "application/json"
            }
        }
    );
}


/*
 * Proxy JSON request.
 */
async function proxyJson(
    url,
    payload,
    apiKey
) {
    const response =
        await fetch(
            url,
            {
                method: "POST",
                headers: {
                    "Authorization":
                        `Bearer ${apiKey}`,
                    "Content-Type":
                        "application/json"
                },
                body:
                    JSON.stringify(payload || {})
            }
        );

    const text =
        await response.text();

    return new Response(
        text,
        {
            status: response.status,
            headers: {
                ...corsHeaders(),
                "Content-Type":
                    response.headers.get(
                        "content-type"
                    ) ||
                    "application/json"
            }
        }
    );
}


/*
 * Discover image-capable models.
 */
async function getImageModels(
    apiKey
) {
    const response =
        await fetch(
            "https://apiduck.servepics.com/v1/models",
            {
                method: "GET",
                headers: {
                    "Authorization":
                        `Bearer ${apiKey}`
                }
            }
        );

    const text =
        await response.text();

    if (!response.ok) {
        return new Response(
            text,
            {
                status: response.status,
                headers: {
                    ...corsHeaders(),
                    "Content-Type":
                        response.headers.get(
                            "content-type"
                        ) ||
                        "application/json"
                }
            }
        );
    }

    let data;

    try {
        data =
            JSON.parse(text);
    } catch {
        return json({
            error:
                "Invalid models response from ApiDuck"
        }, 502);
    }

    const models =
        Array.isArray(data.data)
            ? data.data
                .filter(model =>
                    isImageModel(model)
                )
                .map(model => ({
                    id: model.id,
                    company:
                        model.company ||
                        model.provider ||
                        model.owned_by ||
                        "",
                    supports_generation:
                        true,
                    supports_edit:
                        imageEditSupported(model)
                }))
            : [];

    return json({
        object: "list",
        data: models
    });
}


/*
 * Detect image generation capability.
 */
function isImageModel(model) {
    const id =
        String(model.id || "")
            .toLowerCase();

    const text =
        JSON.stringify(model)
            .toLowerCase();

    if (
        text.includes("image_generation") ||
        text.includes("image-generation") ||
        text.includes("text-to-image") ||
        text.includes("\"image\"")
    ) {
        return true;
    }

    const knownImagePatterns = [
        "grok-imagine",
        "gpt-image",
        "dall-e",
        "nano-banana",
        "gemini-image",
        "seedream",
        "flux",
        "qwen-image",
        "firefly",
        "midjourney",
        "stable-diffusion",
        "sdxl",
        "ideogram",
        "imagen"
    ];

    return knownImagePatterns.some(
        pattern =>
            id.includes(pattern)
    );
}


/*
 * Detect image edit capability.
 */
function imageEditSupported(model) {
    const text =
        JSON.stringify(model)
            .toLowerCase();

    if (
        text.includes("edit") ||
        text.includes("image_edit") ||
        text.includes("image-edit")
    ) {
        return true;
    }

    const id =
        String(model.id || "")
            .toLowerCase();

    const editPatterns = [
        "grok-imagine",
        "gpt-image",
        "dall-e",
        "nano-banana",
        "gemini-image",
        "seedream",
        "flux",
        "qwen-image",
        "firefly",
        "stable-diffusion"
    ];

    return editPatterns.some(
        pattern =>
            id.includes(pattern)
    );
}


/*
 * Handle multipart image edit.
 */
async function handleMultipartEdit(
    req,
    apiKey
) {
    try {
        const incomingForm =
            await req.formData();

        const image =
            incomingForm.get("image");

        const prompt =
            incomingForm.get("prompt");

        const model =
            incomingForm.get("model");

        if (!image) {
            return json({
                error:
                    "Image file is missing"
            }, 400);
        }

        if (!prompt) {
            return json({
                error:
                    "Edit prompt is missing"
            }, 400);
        }

        if (!model) {
            return json({
                error:
                    "Image model is missing"
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
            error:
                "Multipart edit error",
            message:
                error.message
        }, 500);
    }
}


/*
 * Handle JSON/Base64 image edit.
 */
async function handleJsonEdit(
    payload,
    apiKey
) {
    try {
        const imageData =
            payload.image;

        const prompt =
            payload.prompt;

        const model =
            payload.model;

        if (!imageData) {
            return json({
                error:
                    "Image data is missing"
            }, 400);
        }

        if (!prompt) {
            return json({
                error:
                    "Edit prompt is missing"
            }, 400);
        }

        if (!model) {
            return json({
                error:
                    "Image model is missing"
            }, 400);
        }

        let blob;
        let filename =
            "image.png";

        if (
            typeof imageData === "string" &&
            imageData.startsWith("data:")
        ) {
            const match =
                imageData.match(
                    /^data:([^;]+);base64,(.+)$/
                );

            if (!match) {
                return json({
                    error:
                        "Invalid image data"
                }, 400);
            }

            const mimeType =
                match[1];

            const base64 =
                match[2];

            const binary =
                Uint8Array.from(
                    atob(base64),
                    char =>
                        char.charCodeAt(0)
                );

            blob =
                new Blob(
                    [binary],
                    {
                        type: mimeType
                    }
                );

            const extension =
                mimeType.split("/")[1] ||
                "png";

            filename =
                `image.${extension}`;

        } else {
            return json({
                error:
                    "Unsupported image format"
            }, 400);
        }

        return await sendEditToApiDuck(
            new File(
                [blob],
                filename,
                {
                    type:
                        blob.type
                }
            ),
            prompt,
            model,
            apiKey
        );

    } catch (error) {
        return json({
            error:
                "JSON edit error",
            message:
                error.message
        }, 500);
    }
}


/*
 * Send multipart image edit request.
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
        image.name ||
            "image.png"
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

    return new Response(
        text,
        {
            status:
                response.status,
            headers: {
                ...corsHeaders(),
                "Content-Type":
                    response.headers.get(
                        "content-type"
                    ) ||
                    "application/json"
            }
        }
    );
}


/*
 * CORS headers.
 */
function corsHeaders() {
    return {
        "Access-Control-Allow-Origin":
            "*",
        "Access-Control-Allow-Methods":
            "POST, OPTIONS",
        "Access-Control-Allow-Headers":
            "Content-Type, Authorization"
    };
}


/*
 * JSON response.
 */
function json(
    data,
    status = 200
) {
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

