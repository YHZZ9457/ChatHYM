// netlify/functions/suanlema-proxy.mjs
// 这个函数依赖于 Netlify Function 运行时提供的全局 fetch。

const SUANLEMA_API_KEY_ENV_NAME = 'SUANLEMA_API_KEY'; // 环境变量中存储 API Key 的名称
const SUANLEMA_API_BASE_URL = 'https://api.suanli.cn/v1';
const SUANLEMA_CHAT_ENDPOINT = '/chat/completions'; // SuanLeMa 的聊天API端点

console.log(`[SuanLeMa Proxy] Function loaded. Will attempt to read API Key from env var: ${SUANLEMA_API_KEY_ENV_NAME}`);

export default async function handler(request, context) {
  const apiKeyFromEnv = process.env[SUANLEMA_API_KEY_ENV_NAME];
      console.log("--- SUANLEMA PROXY HANDLER ---");
    console.log("Attempting to read SUANLEMA_API_KEY from process.env.");
    if (apiKeyFromEnv) {
        console.log("SUANLEMA_API_KEY FOUND in env. Length:", apiKeyFromEnv.length, "Starts with:", apiKeyFromEnv.substring(0, 5)); // 只打印长度和开头，保护Key
    } else {
        console.error("CRITICAL: SUANLEMA_API_KEY IS UNDEFINED in process.env!");
    }
    console.log("--- END SUANLEMA PROXY HANDLER DEBUG ---");
  const fullApiUrl = `${SUANLEMA_API_BASE_URL}${SUANLEMA_CHAT_ENDPOINT}`;

  // 打印部分请求信息用于调试，避免在日志中暴露过多敏感信息
  console.log(`[SuanLeMa Proxy] Request received. Method: ${request.method}, Path: ${request.path}`);
  if (request.httpMethod !== 'OPTIONS') { // OPTIONS 请求通常没有 body
      try {
          const partialBodyForLog = JSON.stringify(JSON.parse(request.body || '{}'), null, 2).substring(0, 300) + "...";
          console.log("[SuanLeMa Proxy] Partial request body from client:", partialBodyForLog);
      } catch(e) {
          console.warn("[SuanLeMa Proxy] Could not parse or log client request body.");
      }
  }
  console.log(`[SuanLeMa Proxy] API Key found in env: ${apiKeyFromEnv ? 'Yes (masked)' : 'NO - NOT FOUND!'}`);


  // 1. CORS Preflight (OPTIONS request)
  if (request.method === 'OPTIONS') {
    console.log("[SuanLeMa Proxy] Responding to OPTIONS preflight request.");
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*', // 实际部署时应配置为你的前端域名
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  // 2. Only allow POST method for actual API calls
  if (request.method !== 'POST') {
    console.warn(`[SuanLeMa Proxy] Method Not Allowed: ${request.method}`);
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 3. Check if API Key is configured
  if (!apiKeyFromEnv) {
    console.error(`[SuanLeMa Proxy] CRITICAL SERVER ERROR: ${SUANLEMA_API_KEY_ENV_NAME} is not set in environment variables!`);
    return new Response(JSON.stringify({ error: `Server Configuration Error: SuanLeMa API Key (${SUANLEMA_API_KEY_ENV_NAME}) not set.` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 4. Parse request body from frontend
  let requestBodyFromFrontend;
  try {
    if (!request.body) throw new Error("Request body is missing.");
    requestBodyFromFrontend = await request.json();
  } catch (error) {
    console.error("[SuanLeMa Proxy] Error parsing request body from client:", error.message);
    return new Response(JSON.stringify({ error: 'Bad Request: Invalid or missing JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 5. Validate required fields (model and messages)
  const { model: modelIdentifierFromFrontend, messages, temperature, max_tokens, stream } = requestBodyFromFrontend;
  if (!modelIdentifierFromFrontend || !messages || !Array.isArray(messages)) {
    console.warn("[SuanLeMa Proxy] Bad Request: 'model' and 'messages' (as array) are required.", requestBodyFromFrontend);
    return new Response(JSON.stringify({ error: 'Bad Request: "model" and "messages" (as array) are required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 6. Format model name for SuanLeMa API (ensure "free:" prefix)
  let finalModelNameForAPI = modelIdentifierFromFrontend;
  if (typeof modelIdentifierFromFrontend === 'string' && !modelIdentifierFromFrontend.toLowerCase().startsWith('free:')) {
    finalModelNameForAPI = `free:${modelIdentifierFromFrontend}`;
    console.log(`[SuanLeMa Proxy] Prepended "free:" to model name. Original: "${modelIdentifierFromFrontend}", Final for API: "${finalModelNameForAPI}"`);
  }

  // 7. Construct payload for SuanLeMa API
  const suanlemaPayload = {
    model: finalModelNameForAPI,
    messages: messages, // Assuming messages from client are already in correct format
    temperature: temperature !== undefined ? parseFloat(temperature) : 0.7,
    stream: stream || false, // Default to false if not provided
  };
  if (max_tokens !== undefined) {
      suanlemaPayload.max_tokens = parseInt(max_tokens, 10);
  }
  // Add other parameters if SuanLeMa supports them and you pass them from frontend
  // e.g., top_p, presence_penalty, frequency_penalty

  console.log(`[SuanLeMa Proxy] Sending payload to SuanLeMa API (${fullApiUrl}). Stream: ${suanlemaPayload.stream}`);
  // console.log("[SuanLeMa Proxy] Full payload being sent:", JSON.stringify(suanlemaPayload, null, 2)); // Sensitive, use with caution

  // 8. Call the actual SuanLeMa API
  try {
    const apiResponse = await fetch(fullApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeyFromEnv}`,
        'Accept': suanlemaPayload.stream ? 'text/event-stream' : 'application/json',
        // Add any other headers SuanLeMa API might require
      },
      body: JSON.stringify(suanlemaPayload),
    });

    console.log(`[SuanLeMa Proxy] Received response from SuanLeMa API. Status: ${apiResponse.status} ${apiResponse.statusText}`);

    // Check for API errors first
    if (!apiResponse.ok) {
      const errorText = await apiResponse.text(); // Read error text first
      console.error("[SuanLeMa Proxy] SuanLeMa API returned an error. Status:", apiResponse.status, "Response text:", errorText.substring(0, 500) + "...");
      let errorDetail = errorText;
      try {
          const errJson = JSON.parse(errorText);
          errorDetail = errJson.error?.message || errJson.detail || JSON.stringify(errJson); // Try common error fields
      } catch(e) { /* Error text is not JSON, use raw text */ }
      return new Response(JSON.stringify({ error: `SuanLeMa API Error (${apiResponse.status})`, details: errorDetail }), {
        status: apiResponse.status, // Return actual error status from API
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Process successful response (streaming or non-streaming)
    const responseContentTypeHeader = apiResponse.headers.get('content-type') || '';
    if (suanlemaPayload.stream && responseContentTypeHeader.includes('text/event-stream') && apiResponse.body) {
      console.log("[SuanLeMa Proxy] Streaming SuanLeMa response back to client.");
      return new Response(apiResponse.body, {
        status: 200, // Stream started successfully
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          // Copy other relevant headers from apiResponse if needed
        }
      });
    } else if (apiResponse.body) { // Non-streaming or stream not event-stream
      const responseDataText = await apiResponse.text();
      console.log("[SuanLeMa Proxy] Received non-streaming or non-event-stream response. Content-Type:", responseContentTypeHeader);
      // Attempt to parse as JSON, but return raw text if it fails
      let finalBody = responseDataText;
      let finalContentType = responseContentTypeHeader || 'text/plain'; // Default to text/plain if no content-type
      try {
          JSON.parse(responseDataText); // Just to check if it's valid JSON
          finalBody = responseDataText; // Already stringified if it was JSON from API
          if (responseContentTypeHeader.includes('application/json')) {
              finalContentType = 'application/json';
          }
          console.log("[SuanLeMa Proxy] Response is valid JSON (or treated as such).");
      } catch(e) {
          console.warn("[SuanLeMa Proxy] Response from SuanLeMa API was not valid JSON. Returning as raw text. Preview:", responseDataText.substring(0,200)+"...");
      }
      return new Response(finalBody, {
        status: apiResponse.status, // Use actual status from API
        headers: { 'Content-Type': finalContentType, 'Access-Control-Allow-Origin': '*' }
      });
    } else {
      // This case (apiResponse.ok is true but no apiResponse.body) should be rare
      console.error("[SuanLeMa Proxy] SuanLeMa API response was successful but body is missing.");
      return new Response(JSON.stringify({error: "Empty or missing response body from SuanLeMa API despite success status."}), {
          status: 204, // No Content, or 500 if considered an error
          headers: {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}
      });
    }

  } catch (error) { // Errors during fetch to SuanLeMa API or other unhandled errors
    console.error('[SuanLeMa Proxy] Unhandled error during API call or response processing:', error);
    return new Response(JSON.stringify({ error: 'Proxy encountered an error', details: error.message }), {
      status: 502, // Bad Gateway, indicating proxy failure
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}