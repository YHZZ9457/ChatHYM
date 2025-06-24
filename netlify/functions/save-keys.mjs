// 文件路径: netlify/functions/save-keys.mjs (ESM 最终版)

import { promises as fs } from 'fs';
import path from 'path';

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { provider, apiKey } = await request.json();

    if (!provider || !apiKey) {
      return new Response(JSON.stringify({ message: 'Provider and API Key are required.' }), { status: 400 });
    }

    const variableName = `${provider.toUpperCase().replace('-', '_')}_API_KEY_SECRET`;
    const newEntry = `${variableName}=${apiKey}`;

    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';
    
    try {
      envContent = await fs.readFile(envPath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const lines = envContent.split(/\r?\n/);
    let keyFound = false;

    const updatedLines = lines.map(line => {
      if (line.trim().startsWith(`${variableName}=`)) {
        keyFound = true;
        return newEntry;
      }
      return line;
    }).filter(line => line.trim() !== '');

    if (!keyFound) {
      updatedLines.push(newEntry);
    }

    await fs.writeFile(envPath, updatedLines.join('\n') + '\n', 'utf8');
    
    return new Response(JSON.stringify({ message: `API Key for ${provider} has been saved.` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error saving API key:', error);
    return new Response(JSON.stringify({ message: `Internal Server Error: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};