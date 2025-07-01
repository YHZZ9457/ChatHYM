// --- START OF FILE netlify/functions/save-models-local.mjs (最终修正 - 正确路径和导入) ---

// 这个 Netlify Function 负责将模型配置保存到本地的 public/configs/models.json 文件。
// 适用于本地开发环境，在生产环境此操作可能受限或不推荐。

// ★★★ 核心修复 1: 正确导入 fs 和 path 模块 ★★★
import { writeFileSync, readFileSync } from 'fs'; // readFileSync 也是为了调试或确认路径
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';


// ★★★ 核心修复 3: 正确构建目标文件路径 ★★★
// 假设函数文件在 `your-repo/netlify/functions/`
// 目标文件在 `your-repo/public/configs/models.json`
// 所以从 `__dirname` 到 `public/configs/models.json` 是 `../../../public/configs/models.json`
const modelsFilePath = resolve(__dirname, '../../../public/configs/models.json'); 

// 启动时的调试日志 (这些日志会在 Netlify 控制台看到)
console.log('--- save-models-local.mjs ---');
console.log('Detected __dirname:', __dirname);
console.log('Target models.json Path:', modelsFilePath);
console.log('--- end initial path debug ---');

// ★★★ 核心修复 4: handler 函数签名 ★★★
export async function handler(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    console.log('[save-models-local] Received POST request to save models.');
    console.log('[save-models-local] Will attempt to write to:', modelsFilePath);

    try {
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

        // 使用同步写入（writeFileSync）在本地文件系统上，这通常是安全的，因为是无服务器函数的一次性操作。
        // 如果文件较大或需要更高性能，可以考虑 fs.promises.writeFile。
        writeFileSync(modelsFilePath, JSON.stringify(newModelsConfig, null, 2), 'utf8');
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
                message: `保存 models.json 文件失败 (路径: ${modelsFilePath || '路径未定义'})。`,
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
            }),
        };
    }
}