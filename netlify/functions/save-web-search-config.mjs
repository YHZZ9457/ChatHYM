// --- netlify/functions/save-web-search-config.mjs ---

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Formats a value for a .env file.
 * If the value contains spaces, '=', or '#', it will be wrapped in double quotes.
 * @param {string} value The value to format.
 * @returns {string} The formatted value.
 */
function formatEnvValue(value) {
    if (/\s|=|#/.test(value) || value === '') {
        const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `"${escapedValue}"`;
    }
    return value;
}

export default async (request, context) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { apiUrl, apiKey } = await request.json();

    if (!apiUrl && !apiKey) {
        return new Response(JSON.stringify({ message: 'API URL 或 API Key 至少需要填写一项。' }), { status: 400 });
    }

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
    let message = '联网搜索配置：';

    const ENV_VAR_URL = 'WEB_SEARCH_API_URL';
    const ENV_VAR_KEY = 'WEB_SEARCH_API_KEY_SECRET';

    const urlRegex = new RegExp(`^\\s*${ENV_VAR_URL}\\s*=.*`, 'i');
    const keyRegex = new RegExp(`^\\s*${ENV_VAR_KEY}\\s*=.*`, 'i');

    // Filter out old entries and empty lines
    lines = lines.filter(line => 
        !urlRegex.test(line) && !keyRegex.test(line) && line.trim() !== ''
    );

    // Handle API URL
    if (apiUrl) {
        const newUrlLine = `${ENV_VAR_URL}=${formatEnvValue(apiUrl)}`;
        lines.push(newUrlLine);
        message += ' API URL 已保存/更新。';
        updated = true;
    } else if (fileContent.match(urlRegex)) {
        message += ' API URL 已移除。';
        updated = true;
    }

    // Handle API Key
    if (apiKey) {
        const newKeyLine = `${ENV_VAR_KEY}=${formatEnvValue(apiKey)}`;
        lines.push(newKeyLine);
        message += ' API Key 已保存/更新。';
        updated = true;
    } else if (fileContent.match(keyRegex)) {
        message += ' API Key 已移除。';
        updated = true;
    }

    if (updated) {
        const finalContent = lines.join('\n') + '\n';
        writeFileSync(envFilePath, finalContent);
    } else {
        message = '没有进行任何修改。';
    }
    
    return new Response(JSON.stringify({ message: message.trim() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Failed to save Web Search Config:', error);
    return new Response(JSON.stringify({ message: '保存失败：' + error.message }), { status: 500 });
  }
};