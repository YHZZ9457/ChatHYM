// 文件路径: netlify/functions/get-keys-status.mjs (最终修复版)

import { promises as fs } from 'fs';
import path from 'path';

export default async (request) => {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';

    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        return new Response(JSON.stringify({ configuredProviders: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw error;
    }

    const configuredProviders = [];
    const lines = envContent.split(/\r?\n/);

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      // ★★★ 核心修复：采用更简单、更可靠的分割和检查逻辑 ★★★
      const parts = trimmedLine.split('=');
      if (parts.length >= 2) {
        const keyName = parts[0].trim();
        const keyValue = parts.slice(1).join('=').trim(); // 处理 key 值中可能包含 '=' 的情况

        // 检查 key 的格式是否正确，并且 key 的值不为空
        if (keyName.endsWith('_API_KEY_SECRET') && keyValue) {
          // 从 keyName 中提取出提供商名字
          const providerNameUpper = keyName.replace('_API_KEY_SECRET', '');
          
          // 将大写和下划线格式转换为首字母大写的格式
          const formattedProvider = providerNameUpper
            .toLowerCase()
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
          
          configuredProviders.push(formattedProvider);
        }
      }
    }

    return new Response(JSON.stringify({ configuredProviders }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-keys-status function:', error);
    return new Response(JSON.stringify({ message: `Internal Server Error: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};