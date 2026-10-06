/**
 * AetherAI — Zero-Dependency Native Node.js Backend Server
 * Serves static web app & proxies chat requests to Google Gemini 3.8 Flash API cleanly.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Read .env file manually (zero external dependencies)
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx > 0) {
                    const key = trimmed.slice(0, eqIdx).trim();
                    const val = trimmed.slice(eqIdx + 1).trim();
                    process.env[key] = val;
                }
            }
        });
    }
}
loadEnv();

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    // Enable CORS for development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const reqUrl = req.url.split('?')[0];

    // API Chat Proxy Endpoint
    if (reqUrl === '/api/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const parsed = JSON.parse(body || '{}');
                const messages = parsed.messages || [];
                const temperature = parsed.temperature || 0.7;

                const authHeader = req.headers['authorization'];
                const clientKey = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
                const apiKey = clientKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;

                if (!apiKey) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No API Key configured. Please add GEMINI_API_KEY in your local .env file.' }));
                    return;
                }

                // Format OpenAI messages to Gemini format
                const formattedContents = messages
                    .filter(m => m.role !== 'system')
                    .map(m => ({
                        role: m.role === 'assistant' ? 'model' : 'user',
                        parts: [{ text: m.content || '' }]
                    }));

                const systemMsg = messages.find(m => m.role === 'system');
                const geminiPayload = {
                    contents: formattedContents,
                    generationConfig: { temperature: parseFloat(temperature) }
                };

                if (systemMsg) {
                    geminiPayload.systemInstruction = { parts: [{ text: systemMsg.content }] };
                }

                const postData = JSON.stringify(geminiPayload);
                const modelName = 'gemini-3.8-flash';
                const geminiPath = `/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;

                const apiReq = https.request({
                    hostname: 'generativelanguage.googleapis.com',
                    path: geminiPath,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                }, (apiRes) => {
                    if (apiRes.statusCode !== 200) {
                        res.writeHead(apiRes.statusCode, { 'Content-Type': 'text/plain' });
                        apiRes.pipe(res);
                        return;
                    }

                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    });

                    let buffer = '';
                    apiRes.on('data', chunk => {
                        buffer += chunk.toString();
                        const lines = buffer.split('\n');
                        buffer = lines.pop();

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed.startsWith('data: ')) continue;
                            try {
                                const jsonStr = trimmed.replace(/^data:\s*/, '');
                                const data = JSON.parse(jsonStr);
                                const textChunk = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                                if (textChunk) {
                                    const openAiDelta = { choices: [{ delta: { content: textChunk } }] };
                                    res.write(`data: ${JSON.stringify(openAiDelta)}\n\n`);
                                }
                            } catch (e) {}
                        }
                    });

                    apiRes.on('end', () => {
                        res.write('data: [DONE]\n\n');
                        res.end();
                    });
                });

                apiReq.on('error', (err) => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                });

                apiReq.write(postData);
                apiReq.end();
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // Serve Static Files
    let filePath = path.join(__dirname, reqUrl === '/' ? 'index.html' : reqUrl);
    const ext = path.extname(filePath).toLowerCase();

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 AetherAI Chatbot Server running on http://localhost:${PORT}`);
});
