// =====================================================================
// Final, Robust Version of openrouter-proxy.mjs
// =====================================================================

// File Path: netlify/functions/openrouter-proxy.mjs

// --- Environment Variables ---
const API_KEY = process.env.OPENROUTER_API_KEY_SECRET;
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SITE_URL = process.env.URL || 'http://localhost:8888'; // Default to Netlify Dev port
const SITE_NAME = process.env.SITE_NAME || 'ChatHYM';

/**
 * Netlify Edge Function to proxy requests to the OpenRouter API.
 * @param {Request} request - The incoming request object.
 * @returns {Promise<Response>} - The response to send back to the client.
 */
export default async (request) => {
  // 1. Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204, // No Content
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // 2. Validate request method and API key configuration
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: { message: 'Method Not Allowed' } }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: { message: 'Server Configuration Error: OPENROUTER_API_KEY_SECRET is not set.' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 3. Parse the request body from the client
    const requestBody = await request.json();
    const isStream = requestBody.stream || false;

    // 4. Make the actual request to the OpenRouter API
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        // These headers are recommended by OpenRouter for tracking and moderation
        'HTTP-Referer': SITE_URL,
        'X-Title': SITE_NAME,
      },
      body: JSON.stringify(requestBody),
    });

    // 5. Handle potential errors from the OpenRouter API
    if (!apiResponse.ok) {
      // Try to parse the error response from OpenRouter and forward it
      const errorBody = await apiResponse.json().catch(() => ({ error: { message: 'Failed to parse error response from OpenRouter.' } }));
      console.error(`[OpenRouter Proxy] API Error (${apiResponse.status}):`, JSON.stringify(errorBody));
      return new Response(JSON.stringify(errorBody), {
        status: apiResponse.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 6. Handle the successful response
    if (isStream && apiResponse.body) {
      // --- Simplified & Robust Streaming ---
      // Directly return the readable stream from the API response.
      // Netlify's runtime will handle piping it to the client.
      return new Response(apiResponse.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else {
      // --- Non-streaming response ---
      const jsonResponse = await apiResponse.json();
      return new Response(JSON.stringify(jsonResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

  } catch (err) {
    // Handle network errors or other unexpected issues
    console.error('[OpenRouter Proxy] Internal Proxy Error:', err);
    return new Response(JSON.stringify({ error: { message: 'Internal Proxy Error', details: err.message } }), {
      status: 502, // Bad Gateway
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
