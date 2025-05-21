// netlify/functions/save-models-local.mjs
import fs from 'node:fs';
import path from 'node:path';
// 我们将不再依赖 import.meta.url 和 fileURLToPath 来获取 __dirname

// ★★★ 使用 process.cwd() 来获取项目根目录 (在 netlify dev 中通常有效) ★★★
const projectRoot = process.cwd();
const modelsFilePath = path.join(projectRoot, 'models.json'); // 假设 models.json 直接在项目根目录

// 启动时的调试日志
console.log('--- save-models-local.mjs ---');
console.log('Detected Project Root (cwd):', projectRoot);
console.log('Target models.json Path:', modelsFilePath);
console.log('--- end initial path debug ---');

export async function handler(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    console.log('[save-models-local] Received POST request to save models.');
    console.log('[save-models-local] Will attempt to write to:', modelsFilePath);

    try {
        // 确保 modelsFilePath 是一个有效的字符串路径
        if (typeof modelsFilePath !== 'string' || !modelsFilePath) {
            console.error("[save-models-local] CRITICAL: modelsFilePath is invalid or undefined.", modelsFilePath);
            throw new Error("Internal server error: File path for models.json is not configured correctly.");
        }

        const newModelsConfig = JSON.parse(event.body);

        if (!newModelsConfig || typeof newModelsConfig.models === 'undefined' || !Array.isArray(newModelsConfig.models)) {
            console.error("[save-models-local] Invalid data format received. 'models' array is missing or not an array.", newModelsConfig);
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "接收到的模型配置数据格式无效，'models' 字段必须是一个数组。" }),
            };
        }

        fs.writeFileSync(modelsFilePath, JSON.stringify(newModelsConfig, null, 2), 'utf8');
        console.log(`[save-models-local] SUCCESS: models.json at ${modelsFilePath} has been updated!`);
        return {
            statusCode: 200,
            body: JSON.stringify({ message: '模型配置已成功保存到本地 models.json 文件。' }),
        };
    } catch (error) {
        console.error("[save-models-local] Error processing request or writing file:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: `保存 models.json 文件失败 (路径: ${modelsFilePath || '路径未定义'})。`, // 包含路径以便调试
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // 开发模式下显示堆栈
            }),
        };
    }
}