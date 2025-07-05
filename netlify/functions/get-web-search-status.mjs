// --- netlify/functions/get-web-search-status.mjs ---

export async function handler(request, context) {
    try {
        const apiUrl = process.env.WEB_SEARCH_API_URL;
        const apiKey = process.env.WEB_SEARCH_API_KEY_SECRET;

        const status = {
            urlConfigured: apiUrl !== undefined && apiUrl.trim() !== '',
            keyConfigured: apiKey !== undefined && apiKey.trim() !== '',
        };

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(status)
        };

    } catch (error) {
        console.error('[GetWebSearchStatus] FATAL ERROR:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Internal server error.' })
        };
    }
}
