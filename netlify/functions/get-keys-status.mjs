// --- START OF FILE netlify/functions/get-keys-status.mjs (最终正确返回格式版) ---

export async function handler(request, context) {
    try {
        console.log('[GetKeysStatus] Function execution started.');

        const providers = [
            "OpenAI", "Anthropic", "Gemini", "DeepSeek", "Siliconflow", 
            "Openrouter", "Volcengine", "DashScope", "Ollama", "Suanlema"
        ];

        const configuredStatus = {};

        console.log('[GetKeysStatus] Starting provider loop to check environment variables.');
        
        // 调试日志可以保留或移除，现在我们知道它工作正常了
        // console.log('[GetKeysStatus] [DEBUG] All available process.env keys:', Object.keys(process.env));

        for (const provider of providers) {
            const keyEnvVarName = `${provider.toUpperCase()}_API_KEY_SECRET`;
            const apiKey = process.env[keyEnvVarName];

            configuredStatus[provider.toLowerCase()] = {
                keyConfigured: apiKey !== undefined && apiKey.trim() !== '',
            };
        }
        
        console.log('[GetKeysStatus] Provider loop finished successfully.');
        console.log('[GetKeysStatus] Final Configured API Status to be sent to frontend:', configuredStatus);

        // ★★★ 核心修复：使用标准的 Netlify Functions 返回对象格式 ★★★
        return {
            statusCode: 200, // 'S' 和 'C' 必须大写
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(configuredStatus) // body 是一个字符串
        };

    } catch (error) {
        console.error('[GetKeysStatus] FATAL ERROR during function execution:', error);
        
        // ★★★ 核心修复：错误返回也使用标准格式 ★★★
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