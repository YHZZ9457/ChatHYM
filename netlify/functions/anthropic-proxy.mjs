// =====================================================================
// START: 终极健壮版 anthropic-proxy.mjs (请完整替换)
// =====================================================================

// netlify/functions/anthropic-proxy.mjs
console.log("Anthropic Proxy Function Loaded (v-Final - Robust Manual Pumping)");

const API_KEY = process.env.ANTHROPIC_API_KEY_SECRET;
const API_URL = 'https://api.anthropic.com/v1/messages';

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version' },
    });
  }
  if (request.method !== 'POST') { return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 }); }
  if (!API_KEY) { return new Response(JSON.stringify({ error: 'Server Config Error: API Key not set.' }), { status: 500 }); }

  try {
    const requestBody = await request.json();
    const isStream = requestBody.stream || false;
    
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(requestBody),
    });

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      console.error(`[Anthropic Proxy] API Error: ${apiResponse.status}`, errorBody);
      return new Response(errorBody, { status: apiResponse.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

    if (isStream && apiResponse.body) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const reader = apiResponse.body.getReader();

        const pump = async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) { writer.close(); break; }
                    await writer.write(value);
                }
            } catch (e) { writer.abort(e); }
        };
        
        pump();

        return new Response(readable, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
        });
    } else {
      const json = await apiResponse.json();
      return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

  } catch (err) {
    console.error('[Anthropic Proxy Error]', err);
    return new Response(JSON.stringify({ error: 'Proxy internal error', details: err.message }), { status: 502 });
  }
}