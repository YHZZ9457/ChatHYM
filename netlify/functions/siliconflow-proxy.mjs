// =====================================================================
// START: 终极健壮版 siliconflow-proxy.mjs (请完整替换)
// =====================================================================

// netlify/functions/siliconflow-proxy.mjs
console.log("SiliconFlow Proxy Function Loaded (v-Final - Robust Manual Pumping)");

const API_KEY = process.env.SILICONFLOW_API_KEY_SECRET;
const API_URL = 'https://api.siliconflow.cn/v1/chat/completions';

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
    
    // 3. 请求 SiliconFlow API
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify(requestBody),
    });

    // 4. 处理 API 返回的错误
    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      console.error(`[SiliconFlow Proxy] API Error: ${apiResponse.status}`, errorBody);
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
            } catch (e) { console.error("[SiliconFlow Proxy] Stream Pumping Error:", e); writer.abort(e); }
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
    console.error('[SiliconFlow Proxy] Network/internal error', err);
    return new Response(JSON.stringify({ error: 'Proxy internal error', details: err.message }), { status: 502 });
  }
}