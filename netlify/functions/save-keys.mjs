// --- START OF FILE netlify/functions/save-keys.mjs (Intelligent Quoting Fix) ---

// 这个 Netlify Function 负责将 API Key 和 Endpoint 信息写入项目根目录的 .env 文件。
// 它使用 Node.js 的内置 'fs' 和 'path' 模块。

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ★★★ 核心修复 1：添加一个辅助函数，用于智能地为值添加引号 ★★★
/**
 * Formats a value for a .env file.
 * If the value contains spaces, '=', or '#', it will be wrapped in double quotes.
 * @param {string} value The value to format.
 * @returns {string} The formatted value.
 */
function formatEnvValue(value) {
    // 如果值中包含空格、等号、#号，或者它本身就是空的，则用双引号包裹
    if (/\s|=|#/.test(value) || value === '') {
        // 在包裹之前，需要对内部的双引号和反斜杠进行转义
        const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `"${escapedValue}"`;
    }
    // 否则，直接返回值
    return value;
}

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

    // ★★★ 核心修复 2：在函数内部安全地获取 __dirname ★★★
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const envFilePath = resolve(__dirname, '../../../.env'); 

    let fileContent = '';
    try {
        fileContent = readFileSync(envFilePath, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.warn(`.env file not found at ${envFilePath}, creating a new one.`);
            fileContent = '';
            writeFileSync(envFilePath, '');
        } else {
            throw err;
        }
    }
    
    let lines = fileContent.split('\n');
    let updated = false;
    let message = '';

    const envVarKeyName = `${provider.toUpperCase()}_API_KEY_SECRET`;
    const envVarEndpointName = `${provider.toUpperCase()}_API_ENDPOINT_URL`;

    const keyRegex = new RegExp(`^\\s*${envVarKeyName}\\s*=.*`, 'i');
    const endpointRegex = new RegExp(`^\\s*${envVarEndpointName}\\s*=.*`, 'i');

    lines = lines.filter(line => 
        !keyRegex.test(line) && !endpointRegex.test(line) && line.trim() !== ''
    );

    // 处理 API Key
    if (apiKey) {
        // ★★★ 核心修复 3：使用辅助函数来格式化值 ★★★
        const newKeyLine = `${envVarKeyName}=${formatEnvValue(apiKey)}`;
        lines.push(newKeyLine);
        message += `${provider} 的 API Key 已保存/更新！`;
        updated = true;
    } else {
        if (fileContent.match(keyRegex)) {
            message += `${provider} 的 API Key 已移除！`;
            updated = true;
        }
    }

    // 处理 API Endpoint
    if (apiEndpoint) {
        // ★★★ 核心修复 3：使用辅助函数来格式化值 ★★★
        const newEndpointLine = `${envVarEndpointName}=${formatEnvValue(apiEndpoint)}`;
        lines.push(newEndpointLine);
        if (updated) message += ' 并且 ';
        message += `${provider} 的 API Endpoint 已保存/更新！`;
        updated = true;
    } else {
        if (fileContent.match(endpointRegex)) {
            if (updated) message += ' 并且 ';
            message += `${provider} 的 API Endpoint 已移除！`;
            updated = true;
        }
    }

    if (updated) {
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

// --- END OF FILE netlify/functions/save-keys.mjs (Intelligent Quoting Fix) ---