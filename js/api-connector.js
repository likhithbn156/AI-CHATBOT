/**
 * AetherAI — API Connector & Streaming Engine
 * Manages API endpoints, proxy routing, headers, and simulated/real HTTP streaming.
 */

(function () {
    const STORAGE_KEY = 'aether_api_config';

    const defaultConfig = {
        mode: 'gemini', // 'mock' | 'gemini' | 'openai' | 'custom'
        endpointUrl: 'http://localhost:3000/api/chat', // Backend proxy URL
        apiKey: '', // Empty by default; populated via env variable in backend or UI modal
        modelName: 'gemini-3.8-flash',
        temperature: 0.7,
        customHeaders: '{\n  "Content-Type": "application/json"\n}'
    };

    class APIConnector {
        constructor() {
            this.config = this.loadConfig();
        }

        loadConfig() {
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                return stored ? { ...defaultConfig, ...JSON.parse(stored) } : { ...defaultConfig };
            } catch (e) {
                console.warn('Failed to load API config from localStorage', e);
                return { ...defaultConfig };
            }
        }

        saveConfig(newConfig) {
            this.config = { ...this.config, ...newConfig };
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
            } catch (e) {
                console.error('Failed to save API config', e);
            }
        }

        getConfig() {
            return { ...this.config };
        }

        /**
         * Unified send method
         * @param {Array} history - Array of {role, content}
         * @param {Object} options - { onThinking(text), onChunk(text), onComplete(fullText), onError(err), abortSignal }
         */
        async sendPrompt(history, options = {}) {
            const { onThinking, onChunk, onComplete, onError, abortSignal } = options;

            if (this.config.mode === 'mock') {
                return this.streamMockResponse(history, { onThinking, onChunk, onComplete, abortSignal });
            } else {
                return this.streamRealAPIResponse(history, { onThinking, onChunk, onComplete, onError, abortSignal });
            }
        }

        /**
         * Streams a realistic simulated response for instant UI demonstration
         */
        async streamMockResponse(history, { onThinking, onChunk, onComplete, abortSignal }) {
            const lastUserMsg = history[history.length - 1]?.content?.toLowerCase() || '';

            const match = window.AetherPrompts.mockResponses.find(item =>
                item.keywords.some(kw => lastUserMsg.includes(kw))
            ) || window.AetherPrompts.defaultMockFallback;

            if (match.thinking && onThinking) {
                onThinking(match.thinking);
                await this.delay(600);
            }

            const textToStream = match.text;
            let currentText = '';
            const chunkSize = 4;
            
            for (let i = 0; i < textToStream.length; i += chunkSize) {
                if (abortSignal && abortSignal.aborted) {
                    console.log('Stream aborted by user');
                    break;
                }

                const chunk = textToStream.slice(i, i + chunkSize);
                currentText += chunk;

                if (onChunk) onChunk(chunk, currentText);
                await this.delay(Math.floor(Math.random() * 25) + 10);
            }

            if (onComplete) onComplete(currentText);
            return currentText;
        }

        /**
         * Real API Request with SSE Streaming Reader support
         */
        async streamRealAPIResponse(history, { onThinking, onChunk, onComplete, onError, abortSignal }) {
            try {
                let parsedHeaders = {};
                try {
                    parsedHeaders = JSON.parse(this.config.customHeaders || '{}');
                } catch (e) {
                    console.warn('Invalid custom headers JSON, defaulting to empty');
                }

                const headers = {
                    'Content-Type': 'application/json',
                    ...parsedHeaders
                };

                let targetUrl = 'http://localhost:3000/api/chat';
                let payload = {};
                const modelName = 'gemini-3.8-flash';

                // Scenario A: Client provided API Key directly in UI modal -> Call Google Gemini REST API directly
                if (this.config.apiKey && this.config.apiKey.length > 5) {
                    targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;
                    
                    const formattedContents = history
                        .filter(m => m.role !== 'system')
                        .map(m => ({
                            role: m.role === 'assistant' ? 'model' : 'user',
                            parts: [{ text: m.content || '' }]
                        }));

                    const systemMsg = history.find(m => m.role === 'system');
                    payload = {
                        contents: formattedContents,
                        generationConfig: { temperature: parseFloat(this.config.temperature) || 0.7 }
                    };

                    if (systemMsg) {
                        payload.systemInstruction = { parts: [{ text: systemMsg.content }] };
                    }
                } else {
                    // Scenario B: Route to local backend proxy server at http://localhost:3000/api/chat
                    if (this.config.apiKey) {
                        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
                    }
                    payload = {
                        model: modelName,
                        messages: history,
                        temperature: parseFloat(this.config.temperature) || 0.7,
                        stream: true
                    };
                }

                const response = await fetch(targetUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(payload),
                    signal: abortSignal
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`API Error (${response.status}): ${errText || response.statusText}`);
                }

                const contentType = response.headers.get('content-type') || '';
                
                if (response.body && (contentType.includes('event-stream') || contentType.includes('application/octet-stream') || contentType.includes('json'))) {
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder('utf-8');
                    let fullText = '';
                    let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop();

                        for (const line of lines) {
                            const trimmed = line.trim();
                            if (!trimmed || trimmed.startsWith(':')) continue;

                            if (trimmed === 'data: [DONE]') {
                                break;
                            }

                            if (trimmed.startsWith('data: ')) {
                                try {
                                    const jsonStr = trimmed.replace(/^data:\s*/, '');
                                    const data = JSON.parse(jsonStr);
                                    
                                    // Parse OpenAI delta OR native Gemini candidates[0].content.parts[0].text
                                    const contentChunk = data.choices?.[0]?.delta?.content 
                                        || data.candidates?.[0]?.content?.parts?.[0]?.text 
                                        || data.choices?.[0]?.text 
                                        || '';

                                    if (contentChunk) {
                                        fullText += contentChunk;
                                        if (onChunk) onChunk(contentChunk, fullText);
                                    }

                                    const reasoningChunk = data.choices?.[0]?.delta?.reasoning_content;
                                    if (reasoningChunk && onThinking) {
                                        onThinking(reasoningChunk);
                                    }
                                } catch (e) {
                                    fullText += trimmed;
                                    if (onChunk) onChunk(trimmed, fullText);
                                }
                            }
                        }
                    }

                    if (onComplete) onComplete(fullText);
                    return fullText;
                } else {
                    const data = await response.json();
                    const content = data.choices?.[0]?.message?.content 
                        || data.candidates?.[0]?.content?.parts?.[0]?.text 
                        || JSON.stringify(data, null, 2);
                    if (onChunk) onChunk(content, content);
                    if (onComplete) onComplete(content);
                    return content;
                }
            } catch (err) {
                if (err.name === 'AbortError') {
                    console.log('Request aborted by user');
                    return;
                }
                console.error('AetherAPI Error:', err);
                if (onError) onError(err);
                throw err;
            }
        }

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    }

    window.AetherAPI = new APIConnector();
})();
