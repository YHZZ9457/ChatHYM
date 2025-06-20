// netlify/functions/save-prompts-local.mjs

import fs from 'fs/promises';
import path from 'path';

// 获取项目根目录的正确路径
// 在 Netlify build 环境中，__dirname 指向函数文件所在的目录
const projectRoot = path.resolve(process.cwd());
// 目标文件相对于项目根目录的路径
const targetPath = path.join(projectRoot, 'public', 'configs', 'prompts.json');

export async function handler(event, context) {
    // 1. 只允许 POST 请求
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ message: 'Method Not Allowed' }),
        };
    }

    try {
        // 2. 解析请求体中的 JSON 数据
        const data = JSON.parse(event.body);

        // 3. 验证数据结构 (可选但推荐)
        if (!data || !Array.isArray(data.prompts)) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid data format. Expected { "prompts": [...] }.' }),
            };
        }

        // 4. 将数据格式化为带缩进的 JSON 字符串
        const jsonString = JSON.stringify(data, null, 2);

        // 5. 异步写入文件
        await fs.writeFile(targetPath, jsonString, 'utf-8');

        // 6. 返回成功响应
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Prompts saved successfully!' }),
        };

    } catch (error) {
        console.error('Error saving prompts.json:', error);

        // 7. 返回服务器错误响应
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Failed to save prompts.', error: error.message }),
        };
    }
}
