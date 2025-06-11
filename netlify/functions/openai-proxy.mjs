// netlify/functions/openai-proxy.mjs



// A helper function to validate and clean a single message object.
function validateAndCleanMessage(message, index) {
  if (!message || typeof message !== 'object') {
    console.warn(`[Proxy Validator] Message #${index} is not a valid object. Ignoring.`);
    return null;
  }
  const { role, content, tool_call_id } = message;
  const validRoles = ['user', 'assistant', 'system', 'tool'];
  if (!role || !validRoles.includes(role)) {
    console.warn(`[Proxy Validator] Message #${index} has an invalid or missing role: "${role}". Ignoring.`);
    return null;
  }
  if (content === undefined || content === null) {
    if (role === 'tool' && tool_call_id) {
      message.content = "tool call result"; // OpenAI's tool role requires a string content.
      return message;
    }
    console.warn(`[Proxy Validator] Message #${index} has null or undefined content. Ignoring.`);
    return null;
  }
  if (typeof content === 'string') {
    if (content.trim() === '') {
      message.content = ' '; // OpenAI API rejects empty strings.
    }
  } else if (Array.isArray(content)) {
    if (content.length === 0) {
      console.warn(`[Proxy Validator] Message #${index} content is an empty array. Ignoring.`);
      return null;
    }
    const cleanedParts = content.filter(part =>
      part &&
      typeof part.type === 'string' &&
      ( (part.type === 'text' && typeof part.text === 'string' && part.text.trim() !== '') ||
        (part.type === 'image_url' && part.image_url && typeof part.image_url.url === 'string') )
    );
    if (cleanedParts.length === 0) {
      console.warn(`[Proxy Validator] Message #${index} content array is empty after cleaning. Ignoring.`);
      return null;
    }
    message.content = cleanedParts;
  } else {
    console.warn(`[Proxy Validator] Message #${index} has an invalid content type: ${typeof content}. Ignoring.`);
    return null;
  }
  return message;
}


export default async function handler(request, context) {
  // 1. Handle CORS Preflight (OPTIONS) Request
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // 2. Reject non-POST requests
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    // 3. Securely get API Key from environment variables
    const API_KEY = process.env.OPENAI_API_KEY_SECRET;
    if (!API_KEY) {
      console.error("CRITICAL: OPENAI_API_KEY_SECRET is not configured in environment variables.");
      return new Response(JSON.stringify({ error: 'Server configuration error.' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // 4. Parse and validate the request body from the frontend
    const { model, messages, temperature, max_tokens, stream } = await request.json();
    if (!model || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Bad Request: "model" is required and "messages" must be a non-empty array.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    // 5. Sanitize and prepare the 'messages' array
    const cleanedMessages = messages.map(validateAndCleanMessage).filter(Boolean);
    if (cleanedMessages.length === 0) {
      return new Response(JSON.stringify({ error: 'Bad Request: No valid messages left after validation.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
    
    // 6. Construct the final payload for the OpenAI API
    const openaiPayload = {
      model,
      messages: cleanedMessages,
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      stream: !!stream,
    };

    // 7. Intelligently adapt the token limit parameter based on the model
    if (typeof max_tokens === 'number' && max_tokens > 0) {
      const modelsRequiringNewParam = ['o3', 'o3-2025-04-16'];
      if (modelsRequiringNewParam.includes(model)) {
        openaiPayload.max_completion_tokens = max_tokens;
        console.log(`[Proxy] Adapting to 'max_completion_tokens' for model: ${model}`);
      } else {
        openaiPayload.max_tokens = max_tokens;
      }
    }

    console.log("[Proxy] Sending final payload to OpenAI:", JSON.stringify(openaiPayload, null, 2));

    // 8. Forward the request to the OpenAI API
    const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(openaiPayload),
    });

    // 9. Efficiently proxy the response (success or error) back to the client
    // This approach correctly handles streams and avoids "body already read" errors.
    const responseHeaders = {
      'Content-Type': apiResponse.headers.get('Content-Type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...(openaiPayload.stream && {
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }),
    };

    return new Response(apiResponse.body, {
      status: apiResponse.status,
      statusText: apiResponse.statusText,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('[Proxy] An unexpected error occurred:', error);
    // Handle JSON parsing errors from the request body
    if (error instanceof SyntaxError) {
        return new Response(JSON.stringify({ error: 'Bad Request: Invalid JSON format.' }), { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }
    // Handle other errors (e.g., network issues connecting to OpenAI)
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
}