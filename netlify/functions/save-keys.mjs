// netlify/functions/save-keys.js (无口令版本)

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // ★ 修改点 1: 从请求体中不再需要解析 password
        const { provider, apiKey } = JSON.parse(event.body);

        // ★ 修改点 2: 移除整个安全验证部分
        /*
        if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
            return { statusCode: 403, body: JSON.stringify({ message: 'Forbidden: Invalid admin password.' }) };
        }
        */

        if (!provider || !apiKey) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Provider and API Key are required.' }) };
        }

        // 确定环境变量名 (逻辑保持不变)
        const variableName = `${provider.toUpperCase()}_API_KEY_SECRET`;
        const newEntry = `${variableName}=${apiKey}`;

        // 读取、更新并写入 .env 文件 (逻辑保持不变)
        const envPath = path.join(process.cwd(), '.env');
        let envContent = '';
        
        try {
            envContent = await readFile(envPath, 'utf8');
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            console.log('.env file not found, creating a new one.');
        }

        const lines = envContent.split('\n');
        let keyFound = false;

        const updatedLines = lines.map(line => {
            if (line.startsWith(`${variableName}=`)) {
                keyFound = true;
                return newEntry;
            }
            return line;
        }).filter(line => line.trim() !== '');

        if (!keyFound) {
            updatedLines.push(newEntry);
        }

        await writeFile(envPath, updatedLines.join('\n'), 'utf8');
        
        console.log(`Successfully saved ${variableName} to .env file.`);

        return {
            statusCode: 200,
            // ★ (可选) 修改返回消息，不再提及重启
            body: JSON.stringify({ message: `API Key for ${provider} has been saved locally.` })
        };

    } catch (error) {
        console.error('Error saving API key:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: `Internal Server Error: ${error.message}` })
        };
    }
};