// --- START OF FILE netlify/functions/save-keys.mjs (最终无 dotenv 版本) ---

// 这个 Netlify Function 负责将 API Key 和 Endpoint 信息写入项目根目录的 .env 文件。
// 它使用 Node.js 的内置 'fs' 和 'path' 模块。
// 注意：此文件不依赖 dotenv，因为它是直接操作文件，而不是读取环境变量。

import { appendFileSync, readFileSync, writeFileSync } from 'fs'; // Node.js 内置模块
import { resolve, dirname } from 'path'; // Node.js 内置模块
import { fileURLToPath } from 'url'; // Node.js 内置模块

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 移除所有 dotenv 相关的代码！
// import dotenv from 'dotenv';
// if (process.env.NODE_ENV !== 'production') {
//     dotenv.config({ path: resolve(__dirname, '../../../.env') }); 
// }

export default async (request, context) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { provider, apiKey, apiEndpoint } = await request.json();

    if (!provider) {
      return new Response(JSON.stringify({ message: 'Provider is required.' }), { status: 400 });
    }
    if (!apiKey && !apiEndpoint) {
        return new Response(JSON.stringify({ message: 'API Key 或 API Endpoint 至少需要填写一项。' }), { status: 400 });
    }

    // 确保 envFilePath 指向项目根目录的 .env 文件
    // 假设函数文件在 project-root/netlify/functions/，那么 .env 在 project-root/
    const envFilePath = resolve(__dirname, '../../../.env'); 

    let fileContent = '';
    try {
        fileContent = readFileSync(envFilePath, 'utf8');
    } catch (err) {
        // 如果文件不存在，则创建它
        if (err.code === 'ENOENT') {
            console.warn(`.env file not found at ${envFilePath}, creating a new one.`);
            fileContent = '';
            writeFileSync(envFilePath, ''); // 创建空文件
        } else {
            throw err; // 其他错误抛出
        }
    }
    
    let lines = fileContent.split('\n');
    let updated = false;
    let message = '';

    const envVarKeyName = `${provider.toUpperCase()}_API_KEY_SECRET`;
    const envVarEndpointName = `${provider.toUpperCase()}_API_ENDPOINT_URL`;

    // 构建正则表达式，用于匹配现有行
    const keyRegex = new RegExp(`^${envVarKeyName}=.*`, 'gm');
    const endpointRegex = new RegExp(`^${envVarEndpointName}=.*`, 'gm');

    // 过滤掉所有可能被更新或删除的旧行
    lines = lines.filter(line => 
        !line.match(keyRegex) && !line.match(endpointRegex) && line.trim() !== ''
    );

    // 处理 API Key
    if (apiKey) {
        const newKeyLine = `${envVarKeyName}="${apiKey}"`;
        lines.push(newKeyLine);
        message += `${provider} 的 API Key 已保存/更新！`;
        updated = true;
    } else {
        // 如果 apiKey 为空，且之前存在，则表示移除
        // 过滤阶段已经移除了，这里只需要更新消息
        if (fileContent.match(keyRegex)) { // 检查旧文件内容是否包含该 Key
            message += `${provider} 的 API Key 已移除！`;
            updated = true;
        }
    }

    // 处理 API Endpoint
    if (apiEndpoint) {
        const newEndpointLine = `${envVarEndpointName}="${apiEndpoint}"`;
        lines.push(newEndpointLine);
        if (updated) message += ' 并且 ';
        message += `${provider} 的 API Endpoint 已保存/更新！`;
        updated = true;
    } else {
        // 如果 apiEndpoint 为空，且之前存在，则表示移除
        if (fileContent.match(endpointRegex)) { // 检查旧文件内容是否包含该 Endpoint
            if (updated) message += ' 并且 ';
            message += `${provider} 的 API Endpoint 已移除！`;
            updated = true;
        }
    }

    if (updated) {
        // 确保文件末尾有且只有一个换行符
        const finalContent = lines.join('\n') + '\n';
        writeFileSync(envFilePath, finalContent);
    } else {
        message = '没有进行任何修改。';
    }
    
    return new Response(JSON.stringify({ message: message || '操作完成。' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (error) {
    console.error('Failed to save API Key/Endpoint:', error);
    return new Response(JSON.stringify({ message: '保存失败：' + error.message }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
};