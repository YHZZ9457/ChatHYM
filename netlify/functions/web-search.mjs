// --- netlify/functions/web-search.mjs (动态配置版) ---

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    // highlight-start
    // ★ 1. 从环境变量中动态读取 API URL 和 Key ★
    const apiUrl = process.env.WEB_SEARCH_API_URL;
    const apiKey = process.env.WEB_SEARCH_API_KEY_SECRET;

    // ★ 2. 检查配置是否存在 ★
    if (!apiUrl || !apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Web search service is not configured on the server. Please set it up in the settings page.' })
      };
    }
    // highlight-end

    const { query } = JSON.parse(event.body);
    if (!query) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Query is required.' })
      };
    }

    // highlight-start
    // ★ 3. 使用动态读取的 apiUrl 进行 fetch ★
    const response = await fetch(apiUrl, {
    // highlight-end
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // highlight-start
        // ★ 4. 使用动态读取的 apiKey ★
        api_key: apiKey,
        // highlight-end
        query,
        search_depth: "basic",
        include_answer: false,
        max_results: 5,
        include_domains: [],
        exclude_domains: [],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      // highlight-start
      // ★ 5. 优化错误信息 ★
      console.error('Web Search API Error:', response.status, errorData);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: errorData.error || 'Web search API request failed.' })
      };
      // highlight-end
    }

    const data = await response.json();

    // 格式化搜索结果的逻辑保持不变
    const formattedResults = data.results.map(res => {
      const url = res.url || '未知来源';
      const content = res.content || '无内容摘要';
      return `[Source: ${url}]\nSnippet: ${content}`;
    }).join('\n\n');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: formattedResults }),
    };

  } catch (error) {
    console.error('Error in web-search function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' }),
    };
  }
};