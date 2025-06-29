// 文件路径: netlify/functions/save-keys.mjs (ESM 最终版 - 强化调试)

import { promises as fs } from 'fs';
import path from 'path';

export default async (request) => {
  // CORS 预检请求 (保持不变)
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  console.log('[save-keys] Received POST request.'); // 调试日志

  try {
    const { provider, apiKey } = await request.json();
    console.log(`[save-keys] Attempting to save key for provider: ${provider}`); // 调试日志

    if (!provider || !apiKey) {
      console.error('[save-keys] Missing provider or API key in request body.'); // 调试日志
      return new Response(JSON.stringify({ message: 'Provider and API Key are required.' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } // 确保 CORS 头
      });
    }

    const variableName = `${provider.toUpperCase().replace('-', '_')}_API_KEY_SECRET`;
    const newEntry = `${variableName}=${apiKey}`;

    const envPath = path.join(process.cwd(), '.env');
    console.log(`[save-keys] .env file path: ${envPath}`); // 调试日志

    let envContent = '';
    
    try {
      envContent = await fs.readFile(envPath, 'utf8');
      console.log(`[save-keys] Existing .env content read successfully.`); // 调试日志
    } catch (readError) {
      if (readError.code === 'ENOENT') {
        console.log(`[save-keys] .env file not found, creating new one.`); // 调试日志
        envContent = ''; // 文件不存在，从空字符串开始
      } else {
        // 如果是其他读取错误，直接抛出，让外层 catch 捕获
        console.error(`[save-keys] Error reading .env file:`, readError); // 调试日志
        throw readError; 
      }
    }

    const lines = envContent.split(/\r?\n/);
    let keyFound = false;

    const updatedLines = lines.map(line => {
      if (line.trim().startsWith(`${variableName}=`)) {
        keyFound = true;
        return newEntry;
      }
      return line;
    }).filter(line => line.trim() !== ''); // 过滤空行

    if (!keyFound) {
      updatedLines.push(newEntry);
    }

    const finalEnvContent = updatedLines.join('\n') + '\n';
    console.log(`[save-keys] Attempting to write to .env with content length: ${finalEnvContent.length}`); // 调试日志
    console.log(`[save-keys] Final .env content preview: ${finalEnvContent.substring(0, 100)}...`); // 调试日志

    await fs.writeFile(envPath, finalEnvContent, 'utf8');
    console.log(`[save-keys] Successfully wrote to .env file.`); // 调试日志
    
    return new Response(JSON.stringify({ message: `API Key for ${provider} has been saved.` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, // 确保 CORS 头
    });

  } catch (error) {
    // 捕获所有内部错误，并返回统一的 JSON 格式
    console.error('[save-keys] Error saving API key (caught):', error); // 调试日志
    // 确保返回的 error.message 是一个字符串，并且没有包含函数对象
    let errorMessage = 'An unknown error occurred.';
    if (error && typeof error.message === 'string') {
        errorMessage = error.message;
    } else if (error) {
        // 尝试将非字符串错误转换为字符串，避免 Function n 这样的情况
        errorMessage = String(error); 
    }

    return new Response(JSON.stringify({ message: `Internal Server Error: ${errorMessage}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, // 确保 CORS 头
    });
  }
};