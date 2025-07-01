// --- START OF FILE netlify/functions/save-providers-local.mjs ---

// 这个 Netlify Function 负责将提供商配置保存到本地的 public/configs/providers.json 文件。

import { writeFile } from 'fs/promises';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ★★★ 重要：如果你的 Netlify 环境需要，可以取消注释这两行 ★★★
//const __filename = fileURLToPath(import.meta.url);
//const __dirname = dirname(__filename);

const targetPath = resolve(process.cwd(), 'public/configs/providers.json');

export async function handler(event, context) {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    console.log('[save-providers-local] Received POST request to save providers.');
    console.log('[save-providers-local] Will attempt to write to:', targetPath);

    try {
        if (typeof targetPath !== 'string' || !targetPath) {
            console.error("[save-providers-local] CRITICAL: providers.json path is invalid or undefined.", targetPath);
            throw new Error("Internal server error: File path for providers.json is not configured correctly.");
        }

        const newProvidersConfig = JSON.parse(event.body);

        if (!newProvidersConfig || !Array.isArray(newProvidersConfig.providers)) {
            console.error("[save-providers-local] Invalid data format received. 'providers' array is missing or not an array.", newProvidersConfig);
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "接收到的提供商配置数据格式无效，'providers' 字段必须是一个数组。" }),
            };
        }

        await writeFile(targetPath, JSON.stringify(newProvidersConfig, null, 2), 'utf8');
        console.log(`[save-providers-local] SUCCESS: providers.json at ${targetPath} has been updated!`);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: '提供商配置已成功保存到本地 providers.json 文件。' }),
        };
    } catch (error) {
        console.error("[save-providers-local] Error processing request or writing file:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: `保存 providers.json 文件失败 (路径: ${targetPath || '路径未定义'})。`,
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
            }),
        };
    }
}
// --- END OF FILE netlify/functions/save-providers-local.mjs ---