/**
 * AetherAI — Backend API Proxy Server
 * Securely proxies chat requests using environment variables without exposing API keys to the browser.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

/**
 * Chat Proxy Endpoint
 * Forwards requests to Google Gemini or OpenAI compatible endpoints using server-side environment variables.
 */
app.post('/api/chat', async (req, res) => {
    try {
        const { model = 'gemini-2.0-flash', messages = [], temperature = 0.7, stream = true } = req.body;

        // Extract API Key from request headers (if client provided one in UI) or fallback to server env
        const authHeader = req.headers['authorization'];
        const clientApiKey = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';

        const apiKey = clientApiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;

        if (!apiKey) {
            return res.status(400).json({
                error: 'No API Key configured. Please set GEMINI_API_KEY in your server .env file or enter a key in the UI modal.'
            });
        }

        // Target Google Gemini OpenAI-compatible API endpoint
        const targetUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

        const apiResponse = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: temperature,
                stream: stream
            })
        });

        if (!apiResponse.ok) {
            const errText = await apiResponse.text();
            return res.status(apiResponse.status).send(errText);
        }

        // Forward headers and stream back to frontend client
        res.setHeader('Content-Type', apiResponse.headers.get('content-type') || 'application/json');
        
        if (apiResponse.body) {
            const reader = apiResponse.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
            }
            res.end();
        } else {
            const json = await apiResponse.json();
            res.json(json);
        }
    } catch (error) {
        console.error('Server Proxy Error:', error);
        res.status(500).json({ error: 'Internal proxy server error: ' + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 AetherAI Server running on http://localhost:${PORT}`);
});
