/**
 * AetherAI — Main Application UI Controller
 * Manages chat trajectory, markdown parsing, code copy, voice input, modals, shortcuts, theme toggle.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------------------------
    // 1. State Management & Storage
    // ----------------------------------------------------------------------
    const STORAGE_CHATS_KEY = 'aether_chat_sessions';
    const STORAGE_ACTIVE_CHAT_KEY = 'aether_active_chat_id';
    const STORAGE_THEME_KEY = 'aether_theme_mode';
    const STORAGE_SYSTEM_PROMPT_KEY = 'aether_system_instructions';

    let chatSessions = loadChatSessions();
    let activeChatId = localStorage.getItem(STORAGE_ACTIVE_CHAT_KEY) || null;
    let currentAbortController = null;
    let systemPrompt = localStorage.getItem(STORAGE_SYSTEM_PROMPT_KEY) || window.AetherPrompts.systemPresets.default;

    // Feature Toggles
    let isWebSearchEnabled = false;
    let isReasoningEnabled = false;
    let attachedFiles = [];
    let isSpeechRecognitionActive = false;

    // ----------------------------------------------------------------------
    // 2. DOM Elements Selection
    // ----------------------------------------------------------------------
    const el = {
        // App Layout & Sidebar
        sidebar: document.getElementById('sidebar'),
        sidebarOverlay: document.getElementById('sidebar-overlay'),
        toggleSidebarBtn: document.getElementById('toggle-sidebar-btn'),
        sidebarCollapseBtn: document.getElementById('sidebar-collapse-btn'),
        btnNewChat: document.getElementById('btn-new-chat'),
        chatSearchInput: document.getElementById('chat-search-input'),
        pinnedChatsList: document.getElementById('pinned-chats-list'),
        recentChatsList: document.getElementById('recent-chats-list'),
        themeToggleBtn: document.getElementById('theme-toggle-btn'),

        // API Status Card & Modal
        btnOpenApiModal: document.getElementById('btn-open-api-modal'),
        statusIndicator: document.getElementById('status-indicator'),
        statusTitle: document.getElementById('status-title'),
        statusSub: document.getElementById('status-sub'),
        apiModalBackdrop: document.getElementById('api-modal-backdrop'),
        apiModalClose: document.getElementById('api-modal-close'),
        btnCancelApi: document.getElementById('btn-cancel-api'),
        btnSaveApi: document.getElementById('btn-save-api'),
        btnTestApi: document.getElementById('btn-test-api'),
        apiModeSelect: document.getElementById('api-mode-select'),
        apiEndpointUrl: document.getElementById('api-endpoint-url'),
        apiKeyInput: document.getElementById('api-key-input'),
        apiModelName: document.getElementById('api-model-name'),
        apiTemperature: document.getElementById('api-temperature'),
        tempValDisplay: document.getElementById('temp-val-display'),
        apiCustomHeaders: document.getElementById('api-custom-headers'),
        btnToggleKeyVis: document.getElementById('btn-toggle-key-visibility'),
        linkConfigureApi: document.getElementById('link-configure-api'),
        apiProviderTabs: document.getElementById('api-provider-tabs'),

        // Model Dropdown
        modelSelectorBtn: document.getElementById('model-selector-btn'),
        modelDropdown: document.getElementById('model-dropdown'),
        currentModelName: document.getElementById('current-model-name'),
        currentModelDesc: document.getElementById('current-model-desc'),

        // Header Actions & System Prompt Modal
        btnSystemPrompt: document.getElementById('btn-system-prompt'),
        btnExportChat: document.getElementById('btn-export-chat'),
        btnClearChat: document.getElementById('btn-clear-chat'),
        systemPromptModal: document.getElementById('system-prompt-modal'),
        sysModalClose: document.getElementById('sys-modal-close'),
        btnCancelSys: document.getElementById('btn-cancel-sys'),
        btnSaveSys: document.getElementById('btn-save-sys'),
        systemTextarea: document.getElementById('system-instructions-textarea'),

        // Chat Viewport & Empty State
        chatViewport: document.getElementById('chat-viewport'),
        welcomeScreen: document.getElementById('welcome-screen'),
        messagesContainer: document.getElementById('messages-container'),
        suggestionGrid: document.getElementById('suggestion-grid'),
        btnScrollBottom: document.getElementById('btn-scroll-bottom'),

        // Input Controls
        chatForm: document.getElementById('chat-input-form'),
        chatTextarea: document.getElementById('chat-textarea'),
        btnSend: document.getElementById('btn-send'),
        btnAttachFile: document.getElementById('btn-attach-file'),
        fileInput: document.getElementById('file-input'),
        attachmentsPreviewBar: document.getElementById('attachments-preview-bar'),
        btnToggleWeb: document.getElementById('btn-toggle-web'),
        btnToggleReasoning: document.getElementById('btn-toggle-reasoning'),
        btnMic: document.getElementById('btn-mic'),

        // Toast Container
        toastContainer: document.getElementById('toast-container')
    };

    // ----------------------------------------------------------------------
    // 3. Initialization
    // ----------------------------------------------------------------------
    initTheme();
    initChatSessions();
    updateAPIStatusUI();
    bindEvents();

    // ----------------------------------------------------------------------
    // 4. Chat Session & Storage Logic
    // ----------------------------------------------------------------------
    function loadChatSessions() {
        try {
            const raw = localStorage.getItem(STORAGE_CHATS_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('Failed to parse saved chats', e);
            return [];
        }
    }

    function saveChatSessions() {
        try {
            localStorage.setItem(STORAGE_CHATS_KEY, JSON.stringify(chatSessions));
        } catch (e) {
            console.error('Failed to save chats', e);
        }
    }

    function initChatSessions() {
        if (!chatSessions.length) {
            createNewChatSession(false);
        } else {
            if (!activeChatId || !chatSessions.find(c => c.id === activeChatId)) {
                activeChatId = chatSessions[0].id;
            }
            renderChatHistoryList();
            renderActiveChatMessages();
        }
    }

    function createNewChatSession(render = true) {
        const newChat = {
            id: 'chat_' + Date.now(),
            title: 'New Conversation',
            pinned: false,
            timestamp: Date.now(),
            messages: []
        };
        chatSessions.unshift(newChat);
        activeChatId = newChat.id;
        localStorage.setItem(STORAGE_ACTIVE_CHAT_KEY, activeChatId);
        saveChatSessions();

        if (render) {
            renderChatHistoryList();
            renderActiveChatMessages();
            showToast('New conversation started');
        }
    }

    function getActiveChat() {
        return chatSessions.find(c => c.id === activeChatId);
    }

    function renderChatHistoryList(filterQuery = '') {
        el.pinnedChatsList.innerHTML = '';
        el.recentChatsList.innerHTML = '';

        const filtered = chatSessions.filter(c =>
            c.title.toLowerCase().includes(filterQuery.toLowerCase())
        );

        let pinnedCount = 0;
        let recentCount = 0;

        filtered.forEach(chat => {
            const li = document.createElement('li');
            li.className = `chat-item ${chat.id === activeChatId ? 'active' : ''}`;
            li.dataset.id = chat.id;

            li.innerHTML = `
                <span class="chat-item-title">${escapeHTML(chat.title)}</span>
                <div class="chat-item-actions">
                    <button class="btn-icon-sm btn-pin-chat" title="${chat.pinned ? 'Unpin' : 'Pin'}">
                        ${chat.pinned ? '📌' : '📍'}
                    </button>
                    <button class="btn-icon-sm btn-delete-chat" title="Delete conversation">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>
            `;

            li.addEventListener('click', (e) => {
                if (e.target.closest('.btn-pin-chat')) {
                    e.stopPropagation();
                    chat.pinned = !chat.pinned;
                    saveChatSessions();
                    renderChatHistoryList(filterQuery);
                    return;
                }
                if (e.target.closest('.btn-delete-chat')) {
                    e.stopPropagation();
                    deleteChatSession(chat.id);
                    return;
                }
                activeChatId = chat.id;
                localStorage.setItem(STORAGE_ACTIVE_CHAT_KEY, activeChatId);
                renderChatHistoryList(filterQuery);
                renderActiveChatMessages();
            });

            if (chat.pinned) {
                el.pinnedChatsList.appendChild(li);
                pinnedCount++;
            } else {
                el.recentChatsList.appendChild(li);
                recentCount++;
            }
        });

        // Toggle category visibility
        el.pinnedChatsList.parentElement.style.display = pinnedCount > 0 ? 'block' : 'none';
        el.recentChatsList.parentElement.style.display = recentCount > 0 ? 'block' : 'none';
    }

    function deleteChatSession(id) {
        chatSessions = chatSessions.filter(c => c.id !== id);
        if (activeChatId === id) {
            activeChatId = chatSessions.length ? chatSessions[0].id : null;
        }
        if (!chatSessions.length) {
            createNewChatSession(false);
        }
        saveChatSessions();
        renderChatHistoryList();
        renderActiveChatMessages();
        showToast('Conversation deleted');
    }

    // ----------------------------------------------------------------------
    // 5. Message Rendering & Markdown Parser Engine
    // ----------------------------------------------------------------------
    function renderActiveChatMessages() {
        const activeChat = getActiveChat();
        el.messagesContainer.innerHTML = '';

        if (!activeChat || !activeChat.messages || activeChat.messages.length === 0) {
            el.welcomeScreen.style.display = 'flex';
            el.messagesContainer.style.display = 'none';
        } else {
            el.welcomeScreen.style.display = 'none';
            el.messagesContainer.style.display = 'flex';

            activeChat.messages.forEach(msg => {
                appendMessageToDOM(msg.role, msg.content, msg.thinking, false);
            });

            scrollToBottom();
        }
    }

    function appendMessageToDOM(role, content, thinking = null, animate = true) {
        const isUser = role === 'user';
        const row = document.createElement('div');
        row.className = `message-row ${isUser ? 'user-row' : 'bot-row'}`;

        const avatarHTML = isUser
            ? `<div class="msg-avatar user-avatar">U</div>`
            : `<div class="msg-avatar bot-avatar">⚡</div>`;

        let thinkingHTML = '';
        if (thinking) {
            thinkingHTML = `
                <div class="thinking-accordion">
                    <div class="thinking-header">
                        <span>🧠 Thinking Process</span>
                    </div>
                    <div class="thinking-body">${escapeHTML(thinking)}</div>
                </div>
            `;
        }

        const formattedBody = isUser ? escapeHTML(content).replace(/\n/g, '<br>') : parseMarkdown(content);

        const actionsHTML = isUser ? '' : `
            <div class="msg-actions">
                <button class="btn-action-icon btn-copy-msg" title="Copy message">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>Copy</span>
                </button>
                <button class="btn-action-icon btn-like-msg" title="Good response">👍</button>
                <button class="btn-action-icon btn-dislike-msg" title="Bad response">👎</button>
            </div>
        `;

        row.innerHTML = `
            ${avatarHTML}
            <div class="msg-content-wrap">
                <div class="msg-header">
                    <span class="msg-sender">${isUser ? 'You' : 'AetherAI'}</span>
                    <span class="msg-time">${formatTime(new Date())}</span>
                </div>
                ${thinkingHTML}
                <div class="msg-bubble">${formattedBody}</div>
                ${actionsHTML}
            </div>
        `;

        // Event listener for message actions
        const copyBtn = row.querySelector('.btn-copy-msg');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(content);
                showToast('Message copied to clipboard');
            });
        }

        // Attach copy events to code blocks inside message
        row.querySelectorAll('.btn-copy-code').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const code = e.currentTarget.closest('.code-block-container').querySelector('code').innerText;
                navigator.clipboard.writeText(code);
                btn.innerText = 'Copied!';
                setTimeout(() => { btn.innerText = 'Copy Code'; }, 2000);
            });
        });

        el.messagesContainer.appendChild(row);
        if (animate) scrollToBottom();

        return row;
    }

    /**
     * Markdown Parser for code blocks, bold, italics, inline code & lists
     */
    function parseMarkdown(text) {
        if (!text) return '';

        let html = text;

        // Code Blocks ```lang ... ```
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || 'code';
            const escapedCode = escapeHTML(code.trim());
            return `
                <div class="code-block-container">
                    <div class="code-block-header">
                        <span class="code-lang">${language}</span>
                        <button class="btn-copy-code">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            <span>Copy Code</span>
                        </button>
                    </div>
                    <pre class="code-block-body"><code class="language-${language}">${escapedCode}</code></pre>
                </div>
            `;
        });

        // Inline Code `code`
        html = html.replace(/`([^`]+)`/g, '<code class="code-inline">$1</code>');

        // Bold **text**
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Italics *text*
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // Bullet lists - item
        html = html.replace(/^\s*[\-\*]\s+(.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

        // Line breaks
        html = html.replace(/\n/g, '<br>');

        return html;
    }

    // ----------------------------------------------------------------------
    // 6. User Message Submission & Stream Handler
    // ----------------------------------------------------------------------
    async function handleUserSubmit() {
        const userText = el.chatTextarea.value.trim();
        if (!userText && attachedFiles.length === 0) return;

        const activeChat = getActiveChat();
        if (!activeChat) return;

        // Auto-generate conversation title from first prompt
        if (activeChat.messages.length === 0) {
            activeChat.title = userText.slice(0, 32) + (userText.length > 32 ? '...' : '');
            saveChatSessions();
            renderChatHistoryList();
        }

        // Hide welcome screen
        el.welcomeScreen.style.display = 'none';
        el.messagesContainer.style.display = 'flex';

        // Format message with file attachments if any
        let fullMessageText = userText;
        if (attachedFiles.length > 0) {
            const filesInfo = attachedFiles.map(f => `[Attached File: ${f.name}]`).join('\n');
            fullMessageText = `${filesInfo}\n\n${userText}`;
        }

        // Reset input UI
        el.chatTextarea.value = '';
        el.chatTextarea.style.height = 'auto';
        clearAttachments();
        el.btnSend.disabled = true;

        // Append User Message to State & DOM
        activeChat.messages.push({ role: 'user', content: fullMessageText });
        saveChatSessions();
        appendMessageToDOM('user', fullMessageText, null, true);

        // Prepare Bot Response Row & Typing Indicator
        const botRow = createBotStreamRow();
        const msgBubble = botRow.querySelector('.msg-bubble');
        const thinkingWrap = botRow.querySelector('.thinking-accordion');
        const thinkingBody = botRow.querySelector('.thinking-body');

        // Build Payload for API
        const historyPayload = [
            { role: 'system', content: systemPrompt },
            ...activeChat.messages.map(m => ({ role: m.role, content: m.content }))
        ];

        currentAbortController = new AbortController();

        try {
            let streamedText = '';
            let streamedThinking = '';

            await window.AetherAPI.sendPrompt(historyPayload, {
                onThinking: (chunk) => {
                    streamedThinking += chunk;
                    thinkingWrap.style.display = 'block';
                    thinkingBody.innerText = streamedThinking;
                    scrollToBottom();
                },
                onChunk: (chunk, fullText) => {
                    streamedText = fullText;
                    msgBubble.innerHTML = parseMarkdown(fullText);
                    scrollToBottom();
                },
                onComplete: (finalText) => {
                    activeChat.messages.push({
                        role: 'assistant',
                        content: finalText,
                        thinking: streamedThinking || null
                    });
                    saveChatSessions();
                    currentAbortController = null;
                },
                onError: (err) => {
                    msgBubble.innerHTML = `<span style="color: var(--accent-rose);">Error: ${escapeHTML(err.message)}</span>`;
                    currentAbortController = null;
                },
                abortSignal: currentAbortController.signal
            });

        } catch (err) {
            console.error('Submit Error:', err);
        }
    }

    function createBotStreamRow() {
        const row = document.createElement('div');
        row.className = 'message-row bot-row';

        row.innerHTML = `
            <div class="msg-avatar bot-avatar">⚡</div>
            <div class="msg-content-wrap">
                <div class="msg-header">
                    <span class="msg-sender">AetherAI</span>
                    <span class="msg-time">${formatTime(new Date())}</span>
                </div>
                <div class="thinking-accordion" style="display: none;">
                    <div class="thinking-header">
                        <span>🧠 Thinking Process...</span>
                    </div>
                    <div class="thinking-body"></div>
                </div>
                <div class="msg-bubble">
                    <div class="typing-indicator">
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                        <div class="typing-dot"></div>
                    </div>
                </div>
            </div>
        `;

        el.messagesContainer.appendChild(row);
        scrollToBottom();
        return row;
    }

    // ----------------------------------------------------------------------
    // 7. Modals & Settings Management
    // ----------------------------------------------------------------------
    function updateAPIStatusUI() {
        const config = window.AetherAPI.getConfig();
        if (config.mode === 'mock') {
            el.statusIndicator.className = 'status-indicator-dot online';
            el.statusTitle.innerText = 'API Mode: Mock Demo';
            el.statusSub.innerText = 'Simulated streaming (Offline Ready)';
        } else if (config.mode === 'gemini') {
            el.statusIndicator.className = 'status-indicator-dot custom-api';
            el.statusTitle.innerText = `Google Gemini: ${config.modelName || 'gemini-2.0-flash'}`;
            el.statusSub.innerText = 'generativelanguage.googleapis.com';
        } else if (config.mode === 'openai') {
            el.statusIndicator.className = 'status-indicator-dot custom-api';
            el.statusTitle.innerText = `OpenAI: ${config.modelName || 'gpt-4o'}`;
            el.statusSub.innerText = config.endpointUrl ? new URL(config.endpointUrl).hostname : 'Custom Endpoint';
        } else {
            el.statusIndicator.className = 'status-indicator-dot custom-api';
            el.statusTitle.innerText = 'Custom REST API';
            el.statusSub.innerText = 'Connected via HTTP POST';
        }

        // Populate modal inputs
        el.apiModeSelect.value = config.mode;
        el.apiEndpointUrl.value = config.endpointUrl;
        el.apiKeyInput.value = config.apiKey;
        el.apiModelName.value = config.modelName;
        el.apiTemperature.value = config.temperature;
        el.tempValDisplay.innerText = config.temperature;
        el.apiCustomHeaders.value = config.customHeaders;
    }

    function saveAPISettingsFromModal() {
        const newConfig = {
            mode: el.apiModeSelect.value,
            endpointUrl: el.apiEndpointUrl.value.trim(),
            apiKey: el.apiKeyInput.value.trim(),
            modelName: el.apiModelName.value.trim(),
            temperature: parseFloat(el.apiTemperature.value),
            customHeaders: el.apiCustomHeaders.value.trim()
        };

        window.AetherAPI.saveConfig(newConfig);
        updateAPIStatusUI();
        closeModal(el.apiModalBackdrop);
        showToast('API Connection Settings saved!');
    }

    // ----------------------------------------------------------------------
    // 8. Interactive UI Bindings & Event Listeners
    // ----------------------------------------------------------------------
    function bindEvents() {
        // Sidebar Toggles
        el.toggleSidebarBtn.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                el.sidebar.classList.toggle('mobile-open');
                el.sidebarOverlay.classList.toggle('active');
            } else {
                el.sidebar.classList.toggle('collapsed');
            }
        });

        el.sidebarCollapseBtn.addEventListener('click', () => {
            el.sidebar.classList.add('collapsed');
        });

        el.sidebarOverlay.addEventListener('click', () => {
            el.sidebar.classList.remove('mobile-open');
            el.sidebarOverlay.classList.remove('active');
        });

        // New Chat CTA
        el.btnNewChat.addEventListener('click', () => createNewChatSession(true));

        // Search Filter
        el.chatSearchInput.addEventListener('input', (e) => {
            renderChatHistoryList(e.target.value);
        });

        // Theme Toggle
        el.themeToggleBtn.addEventListener('click', toggleTheme);

        // Textarea Auto-Resize & Submit Handlers
        el.chatTextarea.addEventListener('input', () => {
            el.chatTextarea.style.height = 'auto';
            el.chatTextarea.style.height = Math.min(el.chatTextarea.scrollHeight, 180) + 'px';
            el.btnSend.disabled = el.chatTextarea.value.trim().length === 0 && attachedFiles.length === 0;
        });

        el.chatTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleUserSubmit();
            }
        });

        el.chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleUserSubmit();
        });

        // Prompt Suggestion Cards Click
        el.suggestionGrid.querySelectorAll('.suggestion-card').forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.dataset.prompt;
                el.chatTextarea.value = prompt;
                el.btnSend.disabled = false;
                handleUserSubmit();
            });
        });

        // Model Persona Dropdown
        el.modelSelectorBtn.addEventListener('click', () => {
            el.modelDropdown.classList.toggle('show');
            const expanded = el.modelDropdown.classList.contains('show');
            el.modelSelectorBtn.setAttribute('aria-expanded', expanded);
        });

        document.addEventListener('click', (e) => {
            if (!el.modelSelectorBtn.contains(e.target) && !el.modelDropdown.contains(e.target)) {
                el.modelDropdown.classList.remove('show');
            }
        });

        el.modelDropdown.querySelectorAll('.model-option').forEach(opt => {
            opt.addEventListener('click', () => {
                el.modelDropdown.querySelectorAll('.model-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');

                el.currentModelName.innerText = opt.dataset.name;
                el.currentModelDesc.innerText = opt.dataset.desc;
                el.modelDropdown.classList.remove('show');

                showToast(`Switched persona to ${opt.dataset.name}`);
            });
        });

        // Feature Toggles (Web Search & Reasoning)
        el.btnToggleWeb.addEventListener('click', () => {
            isWebSearchEnabled = !isWebSearchEnabled;
            el.btnToggleWeb.classList.toggle('active', isWebSearchEnabled);
            showToast(`Web Search ${isWebSearchEnabled ? 'Enabled' : 'Disabled'}`);
        });

        el.btnToggleReasoning.addEventListener('click', () => {
            isReasoningEnabled = !isReasoningEnabled;
            el.btnToggleReasoning.classList.toggle('active', isReasoningEnabled);
            showToast(`Deep Reasoning ${isReasoningEnabled ? 'Enabled' : 'Disabled'}`);
        });

        // File Upload Attachment
        el.btnAttachFile.addEventListener('click', () => el.fileInput.click());
        el.fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            files.forEach(f => attachedFiles.push(f));
            renderAttachmentChips();
            el.btnSend.disabled = false;
        });

        // Voice Dictation (Web Speech API)
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                el.chatTextarea.value += (el.chatTextarea.value ? ' ' : '') + transcript;
                el.btnSend.disabled = false;
                el.btnMic.style.color = 'var(--text-sub)';
            };

            recognition.onerror = () => {
                el.btnMic.style.color = 'var(--text-sub)';
            };

            el.btnMic.addEventListener('click', () => {
                try {
                    recognition.start();
                    el.btnMic.style.color = 'var(--accent-rose)';
                    showToast('Listening... Speak now');
                } catch (e) {
                    console.warn(e);
                }
            });
        }

        // Modals Triggers & Closers
        el.btnOpenApiModal.addEventListener('click', () => openModal(el.apiModalBackdrop));
        el.linkConfigureApi.addEventListener('click', (e) => {
            e.preventDefault();
            openModal(el.apiModalBackdrop);
        });

        el.apiModalClose.addEventListener('click', () => closeModal(el.apiModalBackdrop));
        el.btnCancelApi.addEventListener('click', () => closeModal(el.apiModalBackdrop));
        el.btnSaveApi.addEventListener('click', saveAPISettingsFromModal);

        el.apiTemperature.addEventListener('input', (e) => {
            el.tempValDisplay.innerText = e.target.value;
        });

        el.btnToggleKeyVis.addEventListener('click', () => {
            const isPass = el.apiKeyInput.type === 'password';
            el.apiKeyInput.type = isPass ? 'text' : 'password';
            el.btnToggleKeyVis.innerText = isPass ? 'Hide' : 'Show';
        });

        // API Modal Provider Presets
        el.apiProviderTabs.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                el.apiProviderTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const provider = btn.dataset.provider;
                el.apiModeSelect.value = provider;
                if (provider === 'gemini') {
                    el.apiEndpointUrl.value = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
                    el.apiModelName.value = 'gemini-2.0-flash';
                } else if (provider === 'openai') {
                    el.apiEndpointUrl.value = 'https://api.openai.com/v1/chat/completions';
                    el.apiModelName.value = 'gpt-4o';
                } else if (provider === 'mock') {
                    el.apiEndpointUrl.value = '';
                }
            });
        });

        // System Prompt Modal
        el.btnSystemPrompt.addEventListener('click', () => {
            el.systemTextarea.value = systemPrompt;
            openModal(el.systemPromptModal);
        });

        el.sysModalClose.addEventListener('click', () => closeModal(el.systemPromptModal));
        el.btnCancelSys.addEventListener('click', () => closeModal(el.systemPromptModal));
        el.btnSaveSys.addEventListener('click', () => {
            systemPrompt = el.systemTextarea.value.trim();
            localStorage.setItem(STORAGE_SYSTEM_PROMPT_KEY, systemPrompt);
            closeModal(el.systemPromptModal);
            showToast('System prompt saved');
        });

        // System Prompt Presets
        el.systemPromptModal.querySelectorAll('.pill-btn').forEach(pill => {
            pill.addEventListener('click', () => {
                const key = pill.dataset.sys;
                if (window.AetherPrompts.systemPresets[key]) {
                    el.systemTextarea.value = window.AetherPrompts.systemPresets[key];
                }
            });
        });

        // Clear Chat & Export Chat
        el.btnClearChat.addEventListener('click', () => {
            const activeChat = getActiveChat();
            if (activeChat) {
                activeChat.messages = [];
                saveChatSessions();
                renderActiveChatMessages();
                showToast('Chat history cleared');
            }
        });

        el.btnExportChat.addEventListener('click', exportChatHistory);

        // Scroll to Bottom Button
        el.chatViewport.addEventListener('scroll', () => {
            const isScrolledUp = el.chatViewport.scrollHeight - el.chatViewport.scrollTop - el.chatViewport.clientHeight > 150;
            el.btnScrollBottom.classList.toggle('visible', isScrolledUp);
        });

        el.btnScrollBottom.addEventListener('click', scrollToBottom);

        // Global Shortcuts (Ctrl+K = New Chat, Esc = Close Modal)
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                createNewChatSession(true);
            }
            if (e.key === 'Escape') {
                closeModal(el.apiModalBackdrop);
                closeModal(el.systemPromptModal);
            }
        });
    }

    // ----------------------------------------------------------------------
    // 9. Utilities & Helpers
    // ----------------------------------------------------------------------
    function renderAttachmentChips() {
        el.attachmentsPreviewBar.innerHTML = '';
        if (attachedFiles.length === 0) {
            el.attachmentsPreviewBar.hidden = true;
            return;
        }

        el.attachmentsPreviewBar.hidden = false;
        attachedFiles.forEach((file, index) => {
            const chip = document.createElement('div');
            chip.className = 'file-chip';
            chip.innerHTML = `
                <span>📎 ${escapeHTML(file.name)}</span>
                <button class="file-chip-remove" data-index="${index}">✕</button>
            `;
            chip.querySelector('.file-chip-remove').addEventListener('click', () => {
                attachedFiles.splice(index, 1);
                renderAttachmentChips();
            });
            el.attachmentsPreviewBar.appendChild(chip);
        });
    }

    function clearAttachments() {
        attachedFiles = [];
        el.fileInput.value = '';
        renderAttachmentChips();
    }

    function scrollToBottom() {
        el.chatViewport.scrollTop = el.chatViewport.scrollHeight;
    }

    function initTheme() {
        const savedTheme = localStorage.getItem(STORAGE_THEME_KEY) || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(STORAGE_THEME_KEY, next);
        showToast(`Theme switched to ${next} mode`);
    }

    function openModal(modalEl) {
        modalEl.hidden = false;
    }

    function closeModal(modalEl) {
        modalEl.hidden = true;
    }

    function showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<span>✨</span> <span>${escapeHTML(msg)}</span>`;
        el.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 2600);
    }

    function exportChatHistory() {
        const activeChat = getActiveChat();
        if (!activeChat || !activeChat.messages.length) {
            showToast('No chat history to export');
            return;
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeChat, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `${activeChat.title.replace(/[^a-z0-9]/gi, '_')}_transcript.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast('Chat exported as JSON');
    }

    function formatTime(date) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});
