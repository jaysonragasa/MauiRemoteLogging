const { contextBridge, ipcRenderer } = require('electron');

/**
 * This script runs in the renderer process, but has access to Node.js APIs.
 * It creates a secure bridge between your UI (index.html) and the main process (main.js).
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // --- Functions the UI can call (now async) ---
  
  /**
   * Asks the main process to start the TCP server.
   * @param {number} port The port number to listen on.
   * @returns {Promise} A promise that resolves with server status or rejects with an error.
   */
  startServer: (port) => ipcRenderer.invoke('start-server', port),

  /**
   * Asks the main process to stop the TCP server.
   * @returns {Promise} A promise that resolves when the server is stopped.
   */
  stopServer: () => ipcRenderer.invoke('stop-server'),

  /**
   * Adds a manual log entry.
   * @param {string} logText The log text to add.
   * @returns {Promise} A promise that resolves when the log is added.
   */
  addManualLog: (logText) => ipcRenderer.invoke('add-manual-log', logText),

  // --- Event listeners (these stay the same) ---

  /**
   * Subscribes to log messages sent from the main process.
   * @param {function} callback The function to call with the log message.
   */
  onLogReceived: (callback) => ipcRenderer.on('log-received', callback),

  /**
   * Subscribes to log batches sent from the main process.
   * @param {function} callback The function to call with the log batch array.
   */
  onLogReceivedBatch: (callback) => ipcRenderer.on('log-received-batch', (event, logs) => callback(logs)),

  /**
   * Subscribes to server status updates from the main process.
   * @param {function} callback The function to call with the status object.
   */
  onServerStatus: (callback) => ipcRenderer.on('server-status', callback)
});