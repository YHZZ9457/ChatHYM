// netlify/functions/gemini-proxy-debug.mjs
// Debug-Enhanced Gemini Proxy Function with Stream Chunk Logging

console.log("▶️ [Init] Gemini Proxy Function Loaded (Debug Mode) at", new Date().toISOString());

const CORS_COMMON = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(request) {
  console.log(`▶️ [Handler] Invoked - Method: ${request.method}, URL: ${request.url}, Time: ${new Date().toISOString()}`);

  // CORS preflight
  if (request.method === 'OPTIONS') {
    console.log('▶️ [CORS] Preflight request');
    return new Response(null, { status: 204, headers: CORS_COMMON });
  }

  // Only allow POST
  if (request.method !== 'POST') {
    console.warn(`⚠️ [Method] Not Allowed: ${request.method}`);
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...CORS_COMMON, 'Content-Type': 'application/json' },
    });
  }

  // Check API key
  const API_KEY = process.env.GEMINI_API_KEY_SECRET;
  if (!API_KEY) {
    console.error('❌ [Config] Missing GEMINI_API_KEY_SECRET');
    return new Response(JSON.stringify({ error: 'Server Config Error: Missing API Key' }), {
      status: 500,
      headers: { ...CORS_COMMON, 'Content-Type': 'application/json' },
    });
  }

  // Parse JSON body
  let body;
  try {
    body = await request.json();
    console.log('▶️ [Body] Parsed JSON:', body);
  } catch (err) {
    console.error('❌ [Body] Invalid JSON:', err.message);
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...CORS_COMMON, 'Content-Type': 'application/json' },
    });
  }

  const { model, contents, generationConfig = {}, stream } = body;
  if (!model || !Array.isArray(contents)) {
    console.error('❌ [Request] Bad Request - model or contents missing or invalid');
    return new Response(JSON.stringify({ error: 'Bad Request: model and contents are required' }), {
      status: 400,
      headers: { ...CORS_COMMON, 'Content-Type': 'application/json' },
    });
  }

  // Build endpoint
  const baseBeta = 'https://generativelanguage.googleapis.com/v1beta/models';
  const endpoint = `${baseBeta}/${model}:generateContent?key=${API_KEY}`;
  console.log(`▶️ [Fetch] Endpoint: ${endpoint}`);
  console.log('▶️ [Fetch] Payload:', { contents, generationConfig });

  try {
    const apiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig }),
    });
    console.log(`▶️ [Fetch] Received status ${apiResponse.status}`);

    // Prepare response headers
    const responseHeaders = new Headers();
    // Copy common and CORS headers
    Object.entries(CORS_COMMON).forEach(([k, v]) => responseHeaders.set(k, v));
    if (stream) {
      responseHeaders.set('Content-Type', 'text/event-stream');
      responseHeaders.set('Cache-Control', 'no-cache');
      responseHeaders.set('Connection', 'keep-alive');
    } else {
      responseHeaders.set('Content-Type', 'application/json');
    }

    // Non-stream: log full body and return
    const text = await apiResponse.text();
    console.log('▶️ [Response] Body Text (forced non-stream):', text);
    
    // 确保响应头是 application/json
    responseHeaders.set('Content-Type', 'application/json');

    return new Response(text, {
        status: apiResponse.status,
        statusText: apiResponse.statusText,
        headers: responseHeaders,
    });
    

      const { readable, writable } = new TransformStream({
        transform(chunk, controller) {
            // chunk 是 Uint8Array 格式的原始数据
            const decodedChunk = new TextDecoder().decode(chunk);
            console.log('▶️ [Stream Chunk]:', decodedChunk);
            // 将原始数据块转发出去
            controller.enqueue(chunk);
        },
        flush(controller) {
            console.log('▶️ [Stream] Finished flushing.');
            controller.terminate();
        }
    });

    // ★★★ 核心修复：使用 pipeTo 并等待它完成 ★★★
    // pipeTo 会自动处理流的读取、写入和关闭，并返回一个 Promise
    // 整个 handler 函数会等待这个 Promise 完成，确保流被完整传输
    apiResponse.body.pipeTo(writable);

    // 返回 TransformStream 的可读端
    return new Response(readable, {
        status: apiResponse.status,
        statusText: apiResponse.statusText,
        headers: responseHeaders,
    });

  } catch (err) {
    console.error('❌ [Proxy] Network/internal error:', err.message);
    return new Response(JSON.stringify({ error: 'Proxy internal error', details: err.message }), {
      status: 502,
      headers: { ...CORS_COMMON, 'Content-Type': 'application/json' },
    });
  }
}
