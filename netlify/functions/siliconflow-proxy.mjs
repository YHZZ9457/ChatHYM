// netlify/functions/siliconflow-proxy.mjs
// IMPORTANT: This version is designed with Netlify Edge Functions in mind for optimal streaming.
// If you are using standard Netlify Functions (AWS Lambda), direct ReadableStream
// passthrough might require different handling or may not be as straightforward.

console.log("SiliconFlow Proxy Edge Function Loaded. Reading SILICONFLOW_API_KEY_SECRET from env.");

export default async function handler(request, context) {
  const API_KEY = process.env.SILICONFLOW_API_KEY_SECRET;
  const API_URL = 'https://api.siliconflow.cn/v1/chat/completions';

  console.log("[SiliconFlow Proxy] Request received. Method:", request.method);

  // 1. CORS Preflight (OPTIONS request)
  if (request.method === 'OPTIONS') {
    console.log("[SiliconFlow Proxy] Handling OPTIONS preflight request.");
    return new Response(null, { // Body should be null or empty for 204
      status: 204, // No Content
      headers: {
        'Access-Control-Allow-Origin': '*', // Or your specific frontend domain
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization', // Add any other custom headers your frontend sends
        'Access-Control-Max-Age': '86400', // Optional: Cache preflight response for 1 day
      }
    });
  }

  // 2. Allow only POST requests for actual API calls
  if (request.method !== 'POST') {
    console.warn("[SiliconFlow Proxy] Method Not Allowed:", request.method);
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Only POST is accepted.' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // Or your specific frontend domain
      }
    });
  }

  // 3. Check for API Key
  if (!API_KEY) {
    console.error("[SiliconFlow Proxy] CRITICAL: SiliconFlow API Key (SILICONFLOW_API_KEY_SECRET) is not configured in environment variables!");
    return new Response(JSON.stringify({ error: 'Server Configuration Error: API Key missing.' }), {
      status: 500, // Internal Server Error
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
    console.log("[SiliconFlow Proxy] Parsed frontend request body.");
  } catch (error) {
    console.error("[SiliconFlow Proxy] Failed to parse JSON body from frontend:", error.message);
    return new Response(JSON.stringify({ error: 'Bad Request: Invalid JSON body.' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 5. Validate required fields from frontend body
  const { model, messages, temperature, max_tokens, stream } = requestBodyFromFrontend;

  if (!model || !messages || !Array.isArray(messages) || messages.length === 0) {
    console.warn("[SiliconFlow Proxy] Bad Request: 'model' and 'messages' (non-empty array) are required.");
    return new Response(JSON.stringify({ error: 'Bad Request: "model" and a non-empty "messages" array are required in the request body.' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 6. Construct the payload for SiliconFlow API
  const siliconflowPayload = {
    model: model,
    messages: messages,
    // SiliconFlow might have different defaults or supported ranges
    max_tokens: max_tokens !== undefined && Number.isInteger(max_tokens) ? max_tokens : 4096, // Default or frontend provided
    temperature: temperature !== undefined && typeof temperature === 'number' ? temperature : 0.7, // Default or frontend provided
    stream: !!stream, // Ensure it's a boolean, defaults to false if 'stream' is not provided
  };

  console.log(`[SiliconFlow Proxy] Forwarding to SiliconFlow API. Stream requested: ${siliconflowPayload.stream}`);
  // Avoid logging full messages in production for privacy if they contain sensitive data
  // console.log("[SiliconFlow Proxy] SiliconFlow API Payload:", JSON.stringify(siliconflowPayload, null, 2));


  // 7. Call the SiliconFlow API
  try {
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        // 'Accept': siliconflowPayload.stream ? 'text/event-stream' : 'application/json' // Some APIs like this header
      },
      body: JSON.stringify(siliconflowPayload),
    });

    console.log(`[SiliconFlow Proxy] SiliconFlow API responded with status: ${apiResponse.status}`);

    // Handle API errors (non-2xx responses)
    if (!apiResponse.ok) {
      let errorBodyText = "Unknown error structure from API.";
      try {
        errorBodyText = await apiResponse.text(); // Try to get error message from API
        // Attempt to parse if it's JSON, otherwise use raw text
        const parsedError = JSON.parse(errorBodyText);
        errorBodyText = JSON.stringify(parsedError, null, 2); // Pretty print if JSON
      } catch (e) {
        // If parsing fails, errorBodyText remains the raw text
      }
      console.error(`[SiliconFlow Proxy] Error from SiliconFlow API (Status ${apiResponse.status}):`, errorBodyText);
      return new Response(JSON.stringify({
        error: `SiliconFlow API Error (Status ${apiResponse.status})`,
        details: errorBodyText
      }), {
        status: apiResponse.status, // Propagate the status from the API
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Handle successful response (2xx)
    if (siliconflowPayload.stream && apiResponse.body) {
      // For streaming responses, directly pass through the body
      console.log("[SiliconFlow Proxy] Streaming response back to client.");
      // Netlify Edge Functions can return a ReadableStream directly.
      // The browser will handle it as an SSE stream if Content-Type is correct.
      return new Response(apiResponse.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8', // CRITICAL for SSE
          'Cache-Control': 'no-cache', // Recommended for SSE
          'Connection': 'keep-alive',  // Recommended for SSE
          'Access-Control-Allow-Origin': '*'
        }
      });
    } else {
      // For non-streaming responses, parse as JSON
      console.log("[SiliconFlow Proxy] Processing non-streaming response.");
      const responseData = await apiResponse.json(); // Assuming non-streamed is always JSON
      return new Response(JSON.stringify(responseData), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

  } catch (error) {
    // Catch fetch errors (e.g., network issues) or other unexpected errors
    console.error('[SiliconFlow Proxy] Network or unexpected error during API call:', error.message, error.stack);
    return new Response(JSON.stringify({
      error: 'Proxy encountered an internal error.',
      details: error.message
    }), {
      status: 502, // Bad Gateway, indicating an issue with the upstream server or proxy itself
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}