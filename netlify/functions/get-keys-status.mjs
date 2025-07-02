// --- START OF FILE netlify/functions/get-keys-status.mjs (动态读取配置版) ---

import { readFileSync } from 'fs';
import { resolve } from 'path';

export async function handler(request, context) {
    try {
        // ★ 1. 动态读取 providers.json 配置文件
        const providersFilePath = resolve(process.cwd(), 'public/configs/providers.json');
        const fileContent = readFileSync(providersFilePath, 'utf8');
        const providerConfig = JSON.parse(fileContent);

        // 检查文件内容是否有效
        if (!providerConfig || !Array.isArray(providerConfig.providers)) {
            throw new Error("Invalid or missing providers.json configuration.");
        }

        const configuredStatus = {};

        // ★ 2. 遍历从配置文件中读取的提供商列表
        for (const provider of providerConfig.providers) {
            // 从每个提供商对象中获取需要检查的环境变量名，例如 "OPENAI_API_KEY_SECRET"
            const keyEnvVarName = provider.apiKeyEnv;
            
            if (keyEnvVarName) {
                // 检查该环境变量是否存在且不为空
                const apiKey = process.env[keyEnvVarName];
                
                // 使用提供商的 value (例如 "openai") 作为返回对象的键
                configuredStatus[provider.value.toLowerCase()] = {
                    keyConfigured: apiKey !== undefined && apiKey.trim() !== '',
                };
            }
        }
        
        console.log('[GetKeysStatus] Final Configured API Status (dynamic):', configuredStatus);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(configuredStatus)
        };

    } catch (error) {
        console.error('[GetKeysStatus] FATAL ERROR during function execution:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Backend function get-keys-status encountered an internal error.',
                details: error.message
            })
        };
    }
}
// --- END OF FILE netlify/functions/get-keys-status.mjs (动态读取配置版) ---

