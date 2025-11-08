/**
 * renderer.js
 * Frontend JavaScript for the Professional Remote Log Server UI
 */

// --- CHECK IF PRELOAD SCRIPT WORKED ---
if (typeof window.electronAPI === 'undefined') {
    const errorMsg = 'FATAL ERROR: window.electronAPI is not defined. The preload.js script may have failed to load or is being blocked. Check the main process console (your terminal) for errors.';
    console.error(errorMsg);
    alert(errorMsg);
    throw new Error(errorMsg);
}

// --- DOM Element References ---
const monacoContainer = document.getElementById('monaco-container');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const portInput = document.getElementById('port-input');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const autoscrollCheckbox = document.getElementById('autoscroll-checkbox');
const logCountSpan = document.getElementById('log-count');
const clearBtn = document.getElementById('clear-btn');
const exportBtn = document.getElementById('export-btn');
const messageModal = document.getElementById('message-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalCloseBtn = document.getElementById('modal-close-btn');
const filterBar = document.getElementById('filter-bar');
const addLogBtn = document.getElementById('add-log-btn');
const logModal = document.getElementById('log-modal');
const logText = document.getElementById('log-text');
const logCancelBtn = document.getElementById('log-cancel-btn');
const logAddBtn = document.getElementById('log-add-btn');
const textFilter = document.getElementById('text-filter');
const scrollTopBtn = document.getElementById('scroll-top');
const scrollBottomBtn = document.getElementById('scroll-bottom');
const contextMenu = document.getElementById('context-menu');

// --- State ---
let logCounter = 0;
let logs = [];
let currentFilter = 'ALL';
let textFilterValue = '';
let editor = null;
let allLogs = [];

// --- Helper Functions ---

/**
 * Shows a custom modal message with enhanced styling.
 */
function showModal(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    messageModal.style.display = 'flex';
    
    // Add fade-in animation
    messageModal.style.opacity = '0';
    setTimeout(() => {
        messageModal.style.opacity = '1';
    }, 10);
}

/**
 * Hides the custom modal with fade-out animation.
 */
function hideModal() {
    messageModal.style.opacity = '0';
    setTimeout(() => {
        messageModal.style.display = 'none';
    }, 200);
}

/**
 * Initialize Monaco Editor with enhanced theme
 */
function initializeEditor() {
    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
        // Define custom language for log syntax highlighting
        monaco.languages.register({ id: 'logfile' });
        
        // Enhanced syntax highlighting rules
        monaco.languages.setMonarchTokensProvider('logfile', {
            tokenizer: {
                root: [
                    [/^\[ERROR\].*$/, 'error-line'],
                    [/^\[WARN\].*$/, 'warn-line'],
                    [/^\[TRACE\].*$/, 'trace-line'],
                    [/^\[INFO\].*$/, 'info-line'],
                    [/^\[SERVER\].*$/, 'server-line'],
                    [/^\[MANUAL\].*$/, 'manual-line'],
                    [/.*/, 'default-line']
                ]
            }
        });
        
        // Enhanced professional theme
        monaco.editor.defineTheme('professional-log-theme', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'error-line', foreground: 'f87171', fontStyle: 'bold' },
                { token: 'warn-line', foreground: 'fbbf24', fontStyle: 'italic' },
                { token: 'trace-line', foreground: 'c084fc' },
                { token: 'info-line', foreground: '60a5fa' },
                { token: 'server-line', foreground: '34d399', fontStyle: 'bold' },
                { token: 'manual-line', foreground: 'a78bfa', fontStyle: 'italic' },
                { token: 'default-line', foreground: 'e2e8f0' }
            ],
            colors: {
                'editor.background': '#0f172a',
                'editor.foreground': '#e2e8f0',
                'editorLineNumber.foreground': '#64748b',
                'editorLineNumber.activeForeground': '#94a3b8',
                'editor.selectionBackground': '#334155',
                'editor.selectionHighlightBackground': '#1e293b',
                'editorCursor.foreground': '#3b82f6',
                'editor.findMatchBackground': '#1d4ed8',
                'editor.findMatchHighlightBackground': '#3730a3',
                'scrollbarSlider.background': '#475569',
                'scrollbarSlider.hoverBackground': '#64748b',
                'scrollbarSlider.activeBackground': '#94a3b8'
            }
        });
        
        editor = monaco.editor.create(monacoContainer, {
            value: '',
            language: 'logfile',
            theme: 'professional-log-theme',
            readOnly: true,
            minimap: { 
                enabled: true,
                scale: 1,
                showSlider: 'always'
            },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            lineNumbers: 'on',
            automaticLayout: true,
            contextmenu: false,
            fontSize: 13,
            fontFamily: 'JetBrains Mono, Consolas, Monaco, monospace',
            lineHeight: 20,
            renderWhitespace: 'selection',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: true
        });
        
        // Enhanced context menu handler
        editor.onContextMenu((e) => {
            e.event.preventDefault();
            const rect = monacoContainer.getBoundingClientRect();
            contextMenu.style.left = (e.event.posx - rect.left + rect.left) + 'px';
            contextMenu.style.top = (e.event.posy - rect.top + rect.top) + 'px';
            contextMenu.style.display = 'block';
            
            // Add fade-in animation
            contextMenu.style.opacity = '0';
            setTimeout(() => {
                contextMenu.style.opacity = '1';
            }, 10);
        });
    });
}

/**
 * Extracts the log level from a message.
 */
function getLogLevel(message) {
    if (message.startsWith('[ERROR]')) return 'ERROR';
    if (message.startsWith('[WARN]')) return 'WARN';
    if (message.startsWith('[INFO]')) return 'INFO';
    if (message.startsWith('[TRACE]')) return 'TRACE';
    if (message.startsWith('[SERVER]')) return 'SERVER';
    if (message.startsWith('[MANUAL]')) return 'MANUAL';
    return 'UNKNOWN';
}

/**
 * Updates the editor content with filtered logs and smooth animations.
 */
function updateEditor() {
    if (!editor) return;
    
    const filteredLogs = allLogs.filter(log => {
        const level = getLogLevel(log);
        const levelMatch = currentFilter === 'ALL' || currentFilter === level;
        const textMatch = !textFilterValue || log.toLowerCase().includes(textFilterValue.toLowerCase());
        return levelMatch && textMatch;
    });
    
    editor.setValue(filteredLogs.join('\n'));
    
    if (autoscrollCheckbox.checked) {
        setTimeout(() => {
            const lineCount = editor.getModel().getLineCount();
            editor.revealLine(lineCount);
        }, 100);
    }
}

/**
 * Applies the currently selected filter with visual feedback.
 */
function applyFilter() {
    updateEditor();
    
    // Add subtle animation to indicate filtering
    const container = document.getElementById('monaco-container');
    container.style.opacity = '0.7';
    setTimeout(() => {
        container.style.opacity = '1';
    }, 150);
}

/**
 * Scrolls to a specific line in the editor with smooth animation.
 */
function scrollToLine(lineNumber) {
    if (editor && lineNumber > 0) {
        editor.revealLine(lineNumber, monaco.editor.ScrollType.Smooth);
        editor.setPosition({ lineNumber, column: 1 });
    }
}

/**
 * Finds the first/last occurrence of a log level.
 */
function findLogLevel(level, findLast = false) {
    const filteredLogs = allLogs.filter(log => {
        const logLevel = getLogLevel(log);
        const levelMatch = currentFilter === 'ALL' || currentFilter === logLevel;
        const textMatch = !textFilterValue || log.toLowerCase().includes(textFilterValue.toLowerCase());
        return levelMatch && textMatch && logLevel === level;
    });
    
    if (filteredLogs.length === 0) return -1;
    
    const targetLog = findLast ? filteredLogs[filteredLogs.length - 1] : filteredLogs[0];
    return allLogs.indexOf(targetLog) + 1;
}

/**
 * Updates the UI to reflect the server status with enhanced animations.
 */
function updateServerStatus(status, message) {
    switch (status) {
        case 'running':
            statusIndicator.className = 'h-2 w-2 rounded-full bg-emerald-500 status-pulse';
            statusText.textContent = `Running on port ${message}`;
            statusText.classList.remove('text-slate-300', 'text-red-400');
            statusText.classList.add('text-emerald-400');
            
            startBtn.disabled = true;
            stopBtn.disabled = false;
            portInput.disabled = true;
            
            // Add success animation
            startBtn.style.transform = 'scale(0.95)';
            setTimeout(() => {
                startBtn.style.transform = 'scale(1)';
            }, 150);
            break;
        
        case 'stopped':
            statusIndicator.className = 'h-2 w-2 rounded-full bg-slate-500';
            statusText.textContent = 'Offline';
            statusText.classList.remove('text-emerald-400', 'text-red-400');
            statusText.classList.add('text-slate-300');
            
            startBtn.disabled = false;
            stopBtn.disabled = true;
            portInput.disabled = false;
            
            // Add stop animation
            stopBtn.style.transform = 'scale(0.95)';
            setTimeout(() => {
                stopBtn.style.transform = 'scale(1)';
            }, 150);
            break;

        case 'error':
            statusIndicator.className = 'h-2 w-2 rounded-full bg-red-500 status-pulse';
            statusText.textContent = 'Error';
            statusText.classList.remove('text-emerald-400', 'text-slate-300');
            statusText.classList.add('text-red-400');
            
            startBtn.disabled = false;
            stopBtn.disabled = true;
            portInput.disabled = false;

            showModal('Server Error', message);
            break;
    }
}

// --- Event Listeners ---

// Modal close button with animation
modalCloseBtn.addEventListener('click', hideModal);

// Click outside modal to close
messageModal.addEventListener('click', (e) => {
    if (e.target === messageModal) {
        hideModal();
    }
});

logModal.addEventListener('click', (e) => {
    if (e.target === logModal) {
        logModal.style.display = 'none';
    }
});

// Start server button with enhanced feedback
startBtn.addEventListener('click', async () => {
    const port = parseInt(portInput.value, 10);
    if (isNaN(port) || port < 1024 || port > 65535) {
        showModal('Invalid Port', 'Please enter a valid port number (1024-65535).');
        return;
    }

    // Add loading state
    startBtn.innerHTML = `
        <svg class="w-4 h-4 inline mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
        Starting...
    `;
    startBtn.disabled = true;

    try {
        const result = await window.electronAPI.startServer(port);
        console.log('Server start result:', result);
        
        if (result.success) {
            updateServerStatus('running', result.port);
        } else {
            updateServerStatus('error', 'Failed to start server.');
        }
    } catch (err) {
        console.error('Error starting server:', err);
        updateServerStatus('error', err.message);
    } finally {
        // Reset button
        startBtn.innerHTML = `
            <svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m6-10V4a2 2 0 00-2-2H5a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2V4z"></path>
            </svg>
            Start Server
        `;
    }
});

// Stop server button with enhanced feedback
stopBtn.addEventListener('click', async () => {
    stopBtn.innerHTML = `
        <svg class="w-4 h-4 inline mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
        Stopping...
    `;
    stopBtn.disabled = true;

    try {
        const result = await window.electronAPI.stopServer();
        if (result.success) {
            updateServerStatus('stopped');
        }
    } catch (err) {
        console.error('Error stopping server:', err);
        updateServerStatus('error', err.message);
    } finally {
        // Reset button
        stopBtn.innerHTML = `
            <svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10h6v4H9z"></path>
            </svg>
            Stop Server
        `;
        stopBtn.disabled = false;
    }
});

// Clear logs button with confirmation
clearBtn.addEventListener('click', () => {
    if (logs.length > 0) {
        // Add subtle confirmation through animation
        clearBtn.style.transform = 'scale(0.95)';
        setTimeout(() => {
            clearBtn.style.transform = 'scale(1)';
            allLogs = [];
            logs = [];
            logCounter = 0;
            logCountSpan.textContent = '0';
            if (editor) editor.setValue('');
        }, 150);
    }
});

// Export logs button with enhanced feedback
exportBtn.addEventListener('click', () => {
    if (logs.length === 0) {
        showModal('Export Logs', 'There are no logs to export.');
        return;
    }
    
    // Add loading animation
    exportBtn.innerHTML = `
        <svg class="w-4 h-4 inline mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
        Exporting...
    `;
    
    setTimeout(() => {
        const blob = new Blob([logs.join('\r\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        a.download = `remote-logs-${timestamp}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Reset button
        exportBtn.innerHTML = `
            <svg class="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            Export
        `;
    }, 500);
});

// Add manual log button
addLogBtn.addEventListener('click', () => {
    logText.value = '';
    logModal.style.display = 'flex';
    logModal.style.opacity = '0';
    setTimeout(() => {
        logModal.style.opacity = '1';
        logText.focus();
    }, 10);
});

// Log modal buttons
logCancelBtn.addEventListener('click', () => {
    logModal.style.opacity = '0';
    setTimeout(() => {
        logModal.style.display = 'none';
    }, 200);
});

logAddBtn.addEventListener('click', async () => {
    const text = logText.value.trim();
    if (text) {
        try {
            await window.electronAPI.addManualLog(text);
            logModal.style.opacity = '0';
            setTimeout(() => {
                logModal.style.display = 'none';
            }, 200);
        } catch (err) {
            showModal('Error', 'Failed to add log: ' + err.message);
        }
    }
});

// Enhanced filter bar with smooth transitions
filterBar.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-btn')) {
        const newFilter = e.target.dataset.filter;
        if (newFilter === currentFilter) return;

        // Update active button visual with smooth transition
        const currentActiveBtn = filterBar.querySelector('.filter-btn.active');
        const newActiveBtn = e.target;
        
        currentActiveBtn.classList.remove('active');
        currentActiveBtn.classList.add('bg-slate-600', 'hover:bg-slate-700', 'text-slate-100');
        
        newActiveBtn.classList.add('active');
        newActiveBtn.classList.remove('bg-slate-600', 'hover:bg-slate-700', 'text-slate-100');
        
        currentFilter = newFilter;
        applyFilter();
    }
});

// Text filter with debounced input
let textFilterTimeout;
textFilter.addEventListener('input', (e) => {
    clearTimeout(textFilterTimeout);
    textFilterTimeout = setTimeout(() => {
        textFilterValue = e.target.value;
        applyFilter();
    }, 300);
});

// Enhanced scroll buttons
scrollTopBtn.addEventListener('click', () => {
    if (editor) {
        editor.revealLine(1, monaco.editor.ScrollType.Smooth);
        scrollTopBtn.style.transform = 'translateY(-2px) scale(0.95)';
        setTimeout(() => {
            scrollTopBtn.style.transform = 'translateY(-2px) scale(1)';
        }, 150);
    }
});

scrollBottomBtn.addEventListener('click', () => {
    if (editor) {
        const lineCount = editor.getModel().getLineCount();
        editor.revealLine(lineCount, monaco.editor.ScrollType.Smooth);
        scrollBottomBtn.style.transform = 'translateY(-2px) scale(0.95)';
        setTimeout(() => {
            scrollBottomBtn.style.transform = 'translateY(-2px) scale(1)';
        }, 150);
    }
});

// Hide context menu on click outside
document.addEventListener('click', () => {
    if (contextMenu.style.display === 'block') {
        contextMenu.style.opacity = '0';
        setTimeout(() => {
            contextMenu.style.display = 'none';
        }, 200);
    }
});

// Enhanced context menu actions
contextMenu.addEventListener('click', (e) => {
    const action = e.target.closest('.context-item')?.dataset.action;
    
    switch(action) {
        case 'scroll-top':
            if (editor) editor.revealLine(1, monaco.editor.ScrollType.Smooth);
            break;
        case 'scroll-bottom':
            if (editor) {
                const lineCount = editor.getModel().getLineCount();
                editor.revealLine(lineCount, monaco.editor.ScrollType.Smooth);
            }
            break;
        case 'scroll-first-error':
            const firstErrorLine = findLogLevel('ERROR');
            if (firstErrorLine > 0) scrollToLine(firstErrorLine);
            break;
        case 'scroll-last-error':
            const lastErrorLine = findLogLevel('ERROR', true);
            if (lastErrorLine > 0) scrollToLine(lastErrorLine);
            break;
    }
    
    contextMenu.style.opacity = '0';
    setTimeout(() => {
        contextMenu.style.display = 'none';
    }, 200);
});

// --- Electron IPC Listeners ---

// Listen for log batches with enhanced UI updates
window.electronAPI.onLogReceivedBatch((newLogs) => {
    newLogs.forEach(log => {
        logCounter++;
        logs.push(log);
        allLogs.push(log);
    });

    // Update UI with smooth counter animation
    const currentCount = parseInt(logCountSpan.textContent);
    const targetCount = logCounter;
    
    if (targetCount > currentCount) {
        let current = currentCount;
        const increment = Math.ceil((targetCount - currentCount) / 10);
        const timer = setInterval(() => {
            current += increment;
            if (current >= targetCount) {
                current = targetCount;
                clearInterval(timer);
            }
            logCountSpan.textContent = current;
        }, 50);
    }
    
    updateEditor();
});

// Initialize Monaco Editor when page loads
initializeEditor();

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case 'k':
                e.preventDefault();
                clearBtn.click();
                break;
            case 'e':
                e.preventDefault();
                exportBtn.click();
                break;
            case 'f':
                e.preventDefault();
                textFilter.focus();
                break;
        }
    }
});