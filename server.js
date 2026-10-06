/**
 * AetherAI — Zero-Dependency Native Node.js Backend Server
 * Serves static web app & proxies chat requests to Groq API (OpenAI-compatible).
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

                const apiKey = process.env.GROQ_API_KEY;

                if (!apiKey) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No API Key configured. Please add GROQ_API_KEY in your local .env file.' }));
                    return;
                }

                // Groq API is OpenAI-compatible
                const groqPayload = JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: messages,
                    temperature: parseFloat(temperature),
                    stream: true
                });

                const apiReq = https.request({
                    hostname: 'api.groq.com',
                    path: '/openai/v1/chat/completions',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Length': Buffer.byteLength(groqPayload)
                    }
                }, (apiRes) => {
                    if (apiRes.statusCode !== 200) {
                        let errBody = '';
                        apiRes.on('data', c => { errBody += c; });
                        apiRes.on('end', () => {
                            res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
                            res.end(errBody);
                        });
                        return;
                    }

                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    });

                    // Groq streams in OpenAI SSE format — pass through directly
                    apiRes.on('data', chunk => {
                        res.write(chunk);
                    });

                    apiRes.on('end', () => {
                        res.end();
                    });
                });

                apiReq.on('error', (err) => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                });

                apiReq.write(groqPayload);
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
    console.log(`⚡ Powered by Groq — llama-3.3-70b-versatile`);
});
