// netlify/functions/get-keys-status.js

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);

exports.handler = async (event) => {
    // 这个端点只接受 GET 请求
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const envPath = path.join(process.cwd(), '.env');
        let envContent = '';

        try {
            envContent = await readFile(envPath, 'utf8');
        } catch (error) {
            // 如果 .env 文件不存在，直接返回空数组，是正常情况
            if (error.code === 'ENOENT') {
                return {
                    statusCode: 200,
                    body: JSON.stringify({ configuredProviders: [] })
                };
            }
            throw error; // 其他读取错误则抛出
        }

        const configuredProviders = [];
        const lines = envContent.split('\n');
        
        // 正则表达式，用于匹配 "PROVIDER_API_KEY_SECRET=some_value"
        // 确保等号后面至少有一个字符，才算有效
        const keyRegex = /^([A-Z]+)_API_KEY_SECRET=.+/;

        for (const line of lines) {
            const match = line.trim().match(keyRegex);
            if (match && match[1]) {
                const providerName = match[1]; // 提取出大写的提供商名字，如 "OPENAI"
                
                // 将大写名字转换为与前端下拉菜单 value 一致的格式 (首字母大写)
                const formattedProvider = providerName.charAt(0).toUpperCase() + providerName.slice(1).toLowerCase();
                configuredProviders.push(formattedProvider);
            }
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ configuredProviders })
        };

    } catch (error) {
        console.error('Error getting API key status:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: `Internal Server Error: ${error.message}` })
        };
    }
};