// netlify/functions/web-search.mjs

// 导出处理函数，使用 ESM 语法
export const handler = async (event) => {
  // 只允许 POST 请求
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const { query } = JSON.parse(event.body);
    const apiKey = process.env.TAVILY_API_KEY; // 从环境变量获取 API Key

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Tavily API key is not configured on the server.' })
      };
    }
    if (!query) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Query is required.' })
      };
    }

    // 直接调用全局 fetch（Node 18+ 原生支持）
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",   // 可以选 "basic" 或 "advanced"
        include_answer: false,   // 只取结果，让 LLM 自己总结
        max_results: 5,          // 最多获取 5 条结果
        include_domains: [],     // 可选：指定包含的域名
        exclude_domains: [],     // 可选：指定排除的域名
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Tavily API Error:', response.status, errorData);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: errorData.error || 'Tavily API request failed.' })
      };
    }

    const data = await response.json();

    // 格式化搜索结果，使其更易于 LLM 理解和引用
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
