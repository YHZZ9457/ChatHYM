// =====================================================================
// START: 终极健壮版 openrouter-proxy.mjs (请完整替换)
// =====================================================================

// netlify/functions/openrouter-proxy.mjs
console.log("OpenRouter Proxy Function Loaded (v-Final - Robust Manual Pumping)");

const API_KEY = process.env.OPENROUTER_API_KEY_SECRET;
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SITE_URL = process.env.URL || 'http://localhost';
const SITE_NAME = process.env.SITE_NAME || 'My Chat App';

export default async function handler(request) {
  // 1. CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' },
    });
  }

  // 2. 检查方法和 API Key
  if (request.method !== 'POST') { return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 }); }
  if (!API_KEY) { return new Response(JSON.stringify({ error: 'Server Config Error: API Key not set.' }), { status: 500 }); }

  try {
    const requestBody = await request.json();
    const isStream = requestBody.stream || false;

    // 3. 请求 OpenRouter API
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

    // 4. 处理 API 返回的错误
    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      console.error(`[OpenRouter Proxy] API Error: ${apiResponse.status}`, errorBody);
      return new Response(errorBody, { status: apiResponse.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

    // 5. ★★★ 可靠的流式处理 ★★★
    if (isStream && apiResponse.body) {
        const { readable, writable } = new TransformStream();
        const pump = async () => {
            const reader = apiResponse.body.getReader();
            const writer = writable.getWriter();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) { writer.close(); break; }
                    await writer.write(value);
                }
            } catch (e) { console.error("[OpenRouter Proxy] Stream Pumping Error:", e); writer.abort(e); }
        };
        pump();
        return new Response(readable, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
        });
    } else {
        // 6. 处理非流式响应
        const json = await apiResponse.json();
        return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

  } catch (err) {
    console.error('[OpenRouter Proxy] Network/internal error', err);
    return new Response(JSON.stringify({ error: 'Proxy internal error', details: err.message }), { status: 502 });
  }
}