// File: netlify/functions/openrouter-proxy.mjs
// This is the final, dependency-free version for Netlify Edge Functions.

// --- Environment Variables ---
const API_KEY = process.env.OPENROUTER_API_KEY_SECRET;
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SITE_URL = process.env.URL || 'http://localhost:8888';
const SITE_NAME = process.env.SITE_NAME || 'ChatHYM';

// --- Main Handler ---
export default async (request, context) => {
  // 1. Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // 2. Validate request method and server configuration
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: { message: 'Method Not Allowed' } }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: { message: 'Server Configuration Error: OPENROUTER_API_KEY_SECRET is not set.' } }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 3. Parse the incoming request body from the frontend
    const requestBody = await request.json();
    const modelName = requestBody.model || '';
    const isStream = requestBody.stream !== false; // Default to true

    // 4. ★★★ Adapt the payload ONLY if it's a Claude model ★★★
    if (modelName.toLowerCase().includes('claude')) {
      const systemMessageIndex = requestBody.messages.findIndex(m => m.role === 'system');
      if (systemMessageIndex !== -1) {
        requestBody.system = requestBody.messages[systemMessageIndex].content;
        requestBody.messages.splice(systemMessageIndex, 1);
      }
      if (!requestBody.max_tokens) {
        requestBody.max_tokens = 4096;
      }
    }

    // 5. Use the GLOBAL, BUILT-IN fetch to make the request
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': SITE_URL,
        'X-Title': SITE_NAME,
      },
      body: JSON.stringify(requestBody),
    });

    // 6. Handle errors from the OpenRouter API
    if (!apiResponse.ok) {
      const errorBody = await apiResponse.json();
      return new Response(JSON.stringify(errorBody), {
        status: apiResponse.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 7. Handle the successful response (streaming or non-streaming)
    if (isStream && apiResponse.body) {
      // The robust streaming logic remains the same
      const { readable, writable } = new TransformStream();
      apiResponse.body.pipeTo(writable).catch(err => {
        console.error('[Proxy Stream] Piping error:', err);
      });
      return new Response(readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else {
      // Non-streaming response
      const jsonResponse = await apiResponse.json();
      return new Response(JSON.stringify(jsonResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

  } catch (err) {
    // 8. Catch any errors within the proxy function itself
    console.error('[OpenRouter Proxy] Internal Server Error:', err);
    return new Response(JSON.stringify({ error: { message: 'Internal Proxy Error', details: err.message } }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};