// netlify/functions/openrouter-proxy.mjs
// Designed with Netlify Edge Functions in mind for optimal streaming.

console.log("OpenRouter Proxy Edge Function Loaded. Reading OPENROUTER_API_KEY_SECRET from env.");

export default async function handler(request, context) {
  const API_KEY = process.env.OPENROUTER_API_KEY_SECRET; // ★★★ 环境变量名更改 ★★★
  const API_URL = 'https://openrouter.ai/api/v1/chat/completions'; // ★★★ API URL 更改 ★★★

  // OpenRouter recommends these headers
  const SITE_URL = process.env.URL || 'http://localhost'; // Get site URL from Netlify env or fallback
  const SITE_NAME = process.env.SITE_NAME || 'My Chat App';  // Get site name or use a default

  console.log(`[OpenRouter Proxy] Request received. Method: ${request.method}. Site URL for Referer: ${SITE_URL}`);

  // 1. CORS Preflight (OPTIONS request)
  if (request.method === 'OPTIONS') {
    console.log("[OpenRouter Proxy] Handling OPTIONS preflight request.");
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization', // Assuming frontend sends Content-Type
      }
    });
  }

  // 2. Allow only POST requests for actual API calls
  if (request.method !== 'POST') {
    console.warn("[OpenRouter Proxy] Method Not Allowed:", request.method);
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Only POST is accepted.' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 3. Check for API Key
  if (!API_KEY) {
    console.error("[OpenRouter Proxy] CRITICAL: OpenRouter API Key (OPENROUTER_API_KEY_SECRET) is not configured!");
    return new Response(JSON.stringify({ error: 'Server Configuration Error: API Key missing.' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 4. Parse request body from the frontend
  let requestBodyFromFrontend;
  try {
    requestBodyFromFrontend = await request.json();
    console.log("[OpenRouter Proxy] Parsed frontend request body.");
  } catch (error) {
    console.error("[OpenRouter Proxy] Failed to parse JSON body from frontend:", error.message);
    return new Response(JSON.stringify({ error: 'Bad Request: Invalid JSON body.' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 5. Validate required fields (OpenRouter is OpenAI compatible, so model and messages are key)
  const { model, messages, stream } = requestBodyFromFrontend; // Extract stream as well

  if (!model || !messages || !Array.isArray(messages) || messages.length === 0) {
    console.warn("[OpenRouter Proxy] Bad Request: 'model' and 'messages' (non-empty array) are required.");
    return new Response(JSON.stringify({ error: 'Bad Request: "model" and a non-empty "messages" array are required.' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 6. Construct the payload for OpenRouter API
  //    We can spread the frontend body as OpenRouter is largely OpenAI compatible.
  //    Any extra fields like temperature, max_tokens will be passed through.
  const openrouterPayload = {
    ...requestBodyFromFrontend, // Spread all properties from frontend
    stream: !!stream,           // Ensure stream is a boolean, defaults to false
  };

  console.log(`[OpenRouter Proxy] Forwarding to OpenRouter API. Stream requested: ${openrouterPayload.stream}. Model: ${openrouterPayload.model}`);
  // console.log("[OpenRouter Proxy] OpenRouter API Payload:", JSON.stringify(openrouterPayload, null, 2));


  // 7. Call the OpenRouter API
  try {
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        // 'Accept': openrouterPayload.stream ? 'text/event-stream' : 'application/json', // Optional but good practice
        'HTTP-Referer': SITE_URL,    // ★★★ OpenRouter recommended header ★★★
        'X-Title': SITE_NAME,        // ★★★ OpenRouter recommended header ★★★
      },
      body: JSON.stringify(openrouterPayload),
    });

    console.log(`[OpenRouter Proxy] OpenRouter API responded with status: ${apiResponse.status}`);

    if (!apiResponse.ok) {
      let errorBodyText = "Unknown error from API.";
      try {
        errorBodyText = await apiResponse.text();
        const parsedError = JSON.parse(errorBodyText); // Attempt to parse, OpenRouter errors are usually JSON
        errorBodyText = parsedError.error?.message || JSON.stringify(parsedError); // Extract message or stringify
      } catch (e) {
        // If parsing fails, errorBodyText remains the raw text
        console.warn("[OpenRouter Proxy] Could not parse error response as JSON, using raw text:", errorBodyText);
      }
      console.error(`[OpenRouter Proxy] Error from OpenRouter API (Status ${apiResponse.status}):`, errorBodyText);
      return new Response(JSON.stringify({
        error: `OpenRouter API Error (Status ${apiResponse.status})`,
        details: errorBodyText // Send parsed or raw error details
      }), {
        status: apiResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Handle successful response (2xx)
    if (openrouterPayload.stream && apiResponse.body) {
      console.log("[OpenRouter Proxy] Streaming response back to client.");
      return new Response(apiResponse.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } else {
      console.log("[OpenRouter Proxy] Processing non-streaming response.");
      const responseData = await apiResponse.json();
      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

  } catch (error) {
    console.error('[OpenRouter Proxy] Network or unexpected error during API call:', error.message, error.stack);
    return new Response(JSON.stringify({
      error: 'Proxy encountered an internal error.',
      details: error.message
    }), {
      status: 502, // Bad Gateway
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}