/**
 * Prompts & Presets Library for AetherAI
 */
window.AetherPrompts = {
    systemPresets: {
        default: "You are AetherAI, an ultra-capable, elegant AI assistant. You excel at providing clean, well-formatted, modern code, step-by-step reasoning, and concise explanations. Always format code using markdown triple backticks with language tags.",
        coder: "You are Code Architect Pro, a world-class senior software engineer. Focus on modern JavaScript, HTML5, CSS3, Python, clean architecture, performance, security, and elegant design patterns. Always provide production-ready snippets with inline comments.",
        writer: "You are Creative Sage, an expert copywriter, editor, and storyteller. Transform complex topics into engaging, crystal-clear prose with compelling tone and impeccable structure.",
        tutor: "You are Socratic Tutor, a patient guide who helps break down complex concepts step-by-step using analogies, clear examples, and encouraging feedback."
    },

    mockResponses: [
        {
            keywords: ["glassmorphic", "glassmorphism", "card", "css", "html"],
            thinking: "Analyzing layout requirements... Designing CSS glassmorphic backdrop-filter, border radius, subtle glow gradients, and hover transitions.",
            text: `Here is a complete, production-ready **Glassmorphism UI Card** component with smooth hover micro-animations:

\`\`\`html
<div class="glass-card">
    <div class="glass-icon">✨</div>
    <h3 class="glass-title">Aesthetic Glassmorphism</h3>
    <p class="glass-desc">Crafted with frosted backdrop-filter blur, glowing borders, and reactive hover lighting.</p>
    <button class="glass-btn">Explore Feature</button>
</div>
\`\`\`

\`\`\`css
.glass-card {
    position: relative;
    padding: 24px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
}

.glass-card:hover {
    transform: translateY(-6px);
    border-color: rgba(139, 92, 246, 0.4);
    box-shadow: 0 12px 40px rgba(139, 92, 246, 0.25);
}
\`\`\`

### Key Design Highlights:
1. **\`backdrop-filter: blur(16px)\`**: Creates the authentic frosted glass effect.
2. **Semi-transparent background**: Uses HSL/RGB alpha channels (\`rgba(255, 255, 255, 0.06)\`).
3. **Subtle Gradient Border**: Enhances depth and visual polish.`
        },
        {
            keywords: ["connect", "api", "backend", "express", "fastapi", "fetch"],
            thinking: "Synthesizing API connection guide... Outlining standard POST body structure, SSE streaming reader, and headers configuration.",
            text: `Connecting your backend API to **AetherAI** is straightforward! The interface communicates via \`js/api-connector.js\`.

### 1. Backend Endpoint Requirement
Your backend (Express / Node / FastAPI / Python / Go) simply needs a POST endpoint that returns JSON or streams Server-Sent Events (SSE).

Example Payload sent by this UI:
\`\`\`json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are AetherAI..." },
    { "role": "user", "content": "Hello world" }
  ],
  "temperature": 0.7
}
\`\`\`

### 2. Standard Fetch Implementation (\`js/api-connector.js\`)
You can edit the built-in \`sendCustomRequest\` method in \`js/api-connector.js\`:

\`\`\`javascript
async function sendToCustomAPI(promptHistory, onChunk) {
    const config = getAPIConfig(); // Reads from localStorage

    const response = await fetch(config.endpointUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${config.apiKey}\`,
            ...config.customHeaders
        },
        body: JSON.stringify({
            model: config.modelName || 'gpt-4o',
            messages: promptHistory,
            temperature: config.temperature
        })
    });

    // Handle Streaming Response (SSE reader)
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        onChunk(chunk); // Updates chat bubble in real-time!
    }
}
\`\`\`

> 💡 Click the **API Status / Settings** button in the bottom left sidebar to input your API Key & Endpoint directly from the UI!`
        },
        {
            keywords: ["code", "fetch", "retry", "async", "javascript"],
            thinking: "Constructing robust async JavaScript fetch handler with exponential backoff and timeout controller.",
            text: `Here is a production-grade **JavaScript Async API Fetch Utility** with exponential backoff retries & abort controller support:

\`\`\`javascript
/**
 * Robust API Fetcher with exponential backoff
 */
async function fetchWithRetry(url, options = {}, maxRetries = 3, backoffMs = 1000) {
    const { timeout = 10000, ...fetchOptions } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal
            });

            clearTimeout(timer);

            if (!response.ok) {
                throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timer);
            const isLastAttempt = attempt === maxRetries;
            
            if (isLastAttempt || error.name === 'AbortError') {
                throw new Error(\`Fetch failed after \${attempt} attempts: \${error.message}\`);
            }

            // Exponential wait: 1s, 2s, 4s...
            const delay = backoffMs * Math.pow(2, attempt - 1);
            console.warn(\`Attempt \${attempt} failed. Retrying in \${delay}ms...\`);
            await new Promise(res => setTimeout(res, delay));
        }
    }
}
\`\`\`

### Usage Example:
\`\`\`javascript
try {
    const data = await fetchWithRetry('https://api.example.com/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'AetherAI' }),
        timeout: 5000
    });
    console.log('Success:', data);
} catch (err) {
    console.error('API Error:', err.message);
}
\`\`\``
        }
    ],

    defaultMockFallback: {
        thinking: "Evaluating query against active model parameters... Formulating structured response with actionable recommendations.",
        text: `Thank you for your message! 

I am currently running in **Simulated / Mock API Mode**. Everything in this interface—from message streaming, markdown rendering, code block syntax, voice dictation UI, and conversation history—is fully operational.

### How to make me a Working Chatbot:
1. Open the **API Connection Settings** (Click **API Mode: Mock Demo** in the sidebar footer or the 🔌 icon).
2. Choose your preferred connection mode:
   - **OpenAI Compatible Endpoint**: e.g., \`https://api.openai.com/v1/chat/completions\` or \`http://localhost:11434/v1/chat/completions\` (Ollama).
   - **Custom REST API**: Your custom server backend.
3. Enter your **API Key** and click **Save Changes**.

Feel free to test sending any query, pasting code snippets, or changing theme/persona!`
    }
};
