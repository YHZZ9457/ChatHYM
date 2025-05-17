// netlify/functions/claude-proxy.mjs

export default async function handler(request, context) {
  const API_KEY = process.env.ANTHROPIC_API_KEY_SECRET;
  const API_URL = 'https://api.anthropic.com/v1/messages';
  const API_VERSION = "2023-06-01";

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (!API_KEY) {
    console.error("Anthropic API Key not configured!");
    return new Response(JSON.stringify({ error: 'API Key not set.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let requestBody;
  try {
    requestBody = await request.json();
  } catch (error) {
    console.error("Invalid request body:", error);
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { model, messages, temperature, max_tokens } = requestBody;

  if (!model || !messages) {
    return new Response(JSON.stringify({ error: '"model" and "messages" are required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const anthropicPayload = {
    model,
    messages,
    max_tokens: max_tokens || 1024,
    temperature: temperature !== undefined ? temperature : 0.7,
  };

  console.log("[Claude Proxy] Request payload:", JSON.stringify(anthropicPayload, null, 2));

  try {
    const apiRes = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': API_VERSION,
      },
      body: JSON.stringify(anthropicPayload),
    });

    const text = await apiRes.text();
    let contentType = apiRes.headers.get('content-type') || 'application/json';
    let body = text;

    // 如果返回的是 JSON，直接转成 JSON
    try {
      body = JSON.stringify(JSON.parse(text));
      contentType = 'application/json';
    } catch (e) {
      // 如果不是标准 JSON，直接原样返回
    }

    return new Response(body, {
      status: apiRes.status,
      headers: { 'Content-Type': contentType }
    });

  } catch (error) {
    console.error('[Claude Proxy] Error calling Anthropic API:', error);
    return new Response(JSON.stringify({ error: 'Proxy failed to fetch from Anthropic API', details: error.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
