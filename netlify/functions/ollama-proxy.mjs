const OLLAMA_API_BASE_URL = 'http://localhost:11434';

export default async function handler(request, context) {
  // 1. CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // 2. 只允许 POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Only POST allowed' }), {
      status: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 3. 解析请求 JSON
  let req;
  try {
    req = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  const { model, messages, stream = false, temperature, max_tokens, system } = req;

  // 4. 构建 Ollama payload
  const payload = {
    model,
    messages,
    stream,
    options: {
      ...(temperature  !== undefined && { temperature }),
      ...(max_tokens   !== undefined && { num_predict: max_tokens }),
    },
    ...(system && { system }),
  };

  // 5. 发送到 Ollama
  let ollamaRes;
  try {
    ollamaRes = await fetch(`${OLLAMA_API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Ollama connection failed' }), {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 6a. 流式模式：原封不动地把 Ollama 的流管道给前端
  if (stream) {
    return new Response(ollamaRes.body, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/x-ndjson',
      },
    });
  }

  // 6b. 非流式：读取完整 JSON，转换成 OpenAI 格式
  let data;
  try {
    data = await ollamaRes.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON from Ollama' }), {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
  if (!ollamaRes.ok || data.error) {
    return new Response(JSON.stringify({ error: data.error || ollamaRes.statusText }), {
      status: ollamaRes.status || 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  const formatted = {
    id: `ollama-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: data.model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: data.message.content },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens:     data.prompt_eval_count || 0,
      completion_tokens: data.eval_count       || 0,
      total_tokens: (data.prompt_eval_count||0) + (data.eval_count||0),
    },
  };

  return new Response(JSON.stringify(formatted), {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
  });
}
