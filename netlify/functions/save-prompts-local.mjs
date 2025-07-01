// --- START OF FILE netlify/functions/save-prompts-local.mjs (最终修正 - 正确路径和导入) ---

// 这个 Netlify Function 负责将预设模板保存到本地的 public/configs/prompts.json 文件。

// ★★★ 核心修复 1: 正确导入 fs 和 path 模块 ★★★
import { writeFile } from 'fs/promises'; // 异步写入
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';


// ★★★ 核心修复 3: 正确构建目标文件路径 ★★★
const targetPath = resolve(__dirname, '../../../public/configs/prompts.json');

export async function handler(event, context) {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    try {
        const data = JSON.parse(event.body);

        if (!data || !Array.isArray(data.prompts)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid data format. Expected { "prompts": [...] }.' }),
            };
        }

        const jsonString = JSON.stringify(data, null, 2);

        // 使用异步写入文件
        await writeFile(targetPath, jsonString, 'utf-8');

        return {
            statusCode: 200,
            body: JSON.stringify({ message: '预设模板已成功保存！' }), // 更友好的提示
        };

    } catch (error) {
        console.error('Error saving prompts.json:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: '保存预设模板失败。', error: error.message }),
        };
    }
}