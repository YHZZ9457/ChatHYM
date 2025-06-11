// netlify/functions/volcengine-proxy.mjs

// 引入 dotenv，以便在本地开发时从 .env 文件加载 API Key
import dotenv from 'dotenv';
dotenv.config();


/**
 * A helper function to validate and clean a single message object.
 * This version correctly handles both string and array (multi-modal) content,
 * making it compatible with modern Volcengine models.
 * @param {object} message The message object from the frontend.
 * @param {number} index The index of the message in the array for logging.
 * @returns {object|null} A cleaned message object or null if invalid.
 */
function validateAndCleanMessage(message, index) {
  if (!message || typeof message !== 'object') {
    console.warn(`[Volcengine Proxy Validator] Message #${index} is not a valid object. Ignoring.`);
    return null;
  }

  const { role, content } = message;
  const validRoles = ['user', 'assistant', 'system'];

  if (!role || !validRoles.includes(role)) {
    console.warn(`[Volcengine Proxy Validator] Message #${index} has an invalid or missing role: "${role}". Ignoring.`);
    return null;
  }
  
  if (content === undefined || content === null) {
      console.warn(`[Volcengine Proxy Validator] Message #${index} has null or undefined content. Ignoring.`);
      return null;
  }

  // ▼▼▼ 核心修正：正确处理字符串和数组两种情况 ▼▼▼
  if (typeof content === 'string') {
    if (content.trim() === '') {
      message.content = ' '; // API might reject empty strings.
    }
  } else if (Array.isArray(content)) {
    // 如果是数组，校验其结构是否符合多模态要求
    if (content.length === 0) {
      console.warn(`[Volcengine Proxy Validator] Message #${index} content is an empty array. Ignoring.`);
      return null;
    }
    const cleanedParts = content.filter(part =>
      part && typeof part.type === 'string' &&
      ( (part.type === 'text' && typeof part.text === 'string' && part.text.trim() !== '') ||
        (part.type === 'image_url' && part.image_url && typeof part.image_url.url === 'string') )
    );
    if (cleanedParts.length === 0) {
      console.warn(`[Volcengine Proxy Validator] Message #${index} content array is empty after cleaning. Ignoring.`);
      return null;
    }
    message.content = cleanedParts;
  } else {
    // 其他所有类型（如 number, object）都是无效的
    console.warn(`[Volcengine Proxy Validator] Message #${index} has an invalid content type: ${typeof content}. Ignoring.`);
    return null;
  }
  
  return message;
}


/**
 * Netlify Function to proxy requests to the Volcengine Ark API.
 */
export default async function handler(request, context) {
  // 1. Handle CORS Preflight (OPTIONS) Request
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

  // 2. Reject non-POST requests
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    // 3. Get API Key from environment variables (loaded by dotenv)
    const VOLCENGINE_API_KEY = process.env.VOLCENGINE_API_KEY;

    if (!VOLCENGINE_API_KEY) {
      console.error("[Volcengine Proxy] CRITICAL: VOLCENGINE_API_KEY not found in process.env. Please check your .env file.");
      return new Response(JSON.stringify({ error: 'Server configuration error: VOLCENGINE_API_KEY is not set.' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // 4. Parse and validate the request body from the frontend
    const { model, messages, temperature, max_tokens, stream } = await request.json();

    if (!model || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Bad Request: "model" and a non-empty "messages" array are required.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // 5. Sanitize the 'messages' array using the updated helper function
    const cleanedMessages = messages.map(validateAndCleanMessage).filter(Boolean);
    if (cleanedMessages.length === 0) {
      return new Response(JSON.stringify({ error: 'Bad Request: No valid messages left after validation.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    
    // 6. Construct the final payload for the Volcengine API
    const volcenginePayload = {
      model,
      messages: cleanedMessages,
      stream: !!stream,
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      ...(typeof max_tokens === 'number' && max_tokens > 0 && { max_tokens }),
    };

    // 7. Define the hardcoded API endpoint
    const BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
    const endpoint = `${BASE_URL}/chat/completions`;

    console.log(`[Volcengine Proxy] Sending payload to endpoint: ${endpoint}`);
    console.log("[Volcengine Proxy] Payload:", JSON.stringify(volcenginePayload, null, 2));

    // 8. Forward the request to the Volcengine API
    const apiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VOLCENGINE_API_KEY}`,
      },
      body: JSON.stringify(volcenginePayload),
    });

    // 9. Efficiently proxy the response back to the client
    const responseHeaders = {
      'Content-Type': apiResponse.headers.get('Content-Type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...(volcenginePayload.stream && { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }),
    };

    return new Response(apiResponse.body, {
      status: apiResponse.status,
      statusText: apiResponse.statusText,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('[Volcengine Proxy] An unexpected error occurred:', error);
    if (error instanceof SyntaxError) {
      return new Response(JSON.stringify({ error: 'Bad Request: Invalid JSON format.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
}