/**
 * main.js
 * This is the "main process" for your Electron app. It creates the desktop
 * window and runs the Node.js TCP server in the background.
 */

// Import necessary modules from Electron and Node.js
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('node:path');
const net = require('node:net'); // Node.js TCP server module

// --- Configuration ---
const CONFIG = {
  BATCH_DELAY: 500, // Delay in milliseconds for batching logs
};

// --- State ---
let mainWindow; // Holds the reference to the main browser window
let server = null; // Holds the TCP server instance
let clientSockets = new Set(); // Stores all active client connections
let isStopping = false; // Flag to prevent start/stop race condition
let logQueue = []; // Queue for batching logs
let batchTimer = null; // Timer for sending batched logs

// --- Helper Functions ---

/**
 * Queues logs for batch sending to UI.
 * @param {string[]} logs Array of log messages to queue.
 */
function queueLogs(logs) {
  logQueue.push(...logs);
  
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      if (logQueue.length > 0 && mainWindow) {
        mainWindow.webContents.send('log-received-batch', logQueue);
        logQueue = [];
      }
      batchTimer = null;
    }, CONFIG.BATCH_DELAY);
  }
}

/**
 * Sends a log message from the server itself to the UI.
 * @param {string} message The log message.
 */
function logToServerUI(message) {
  queueLogs([`[SERVER] ${message}`]);
  console.log(`[SERVER] ${message}`);
}

/**
 * Creates the main application window.
 */
function createWindow() {
  console.log('DEBUG: createWindow() called.');

  // Create the browser window with specific settings
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // __dirname is the current directory (your project root)
      // path.join is used to create a cross-platform file path
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // Secure, recommended
      nodeIntegration: false, // Secure, recommended
    },
  });

  // Load the index.html file into the window
  mainWindow.loadFile('index.html');

  // Open the DevTools (browser's developer tools) for debugging
  // You can comment this out for production
  // mainWindow.webContents.openDevTools();

  // Clean up when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Starts the TCP log server on the specified port.
 * @param {number} port The port number to listen on.
 */
function startLogServer(port) {
  // Use a Promise to handle success/failure asynchronously
  return new Promise((resolve, reject) => {
    // Create a new TCP server
    server = net.createServer((socket) => {
      // --- A new client has connected ---
      const clientAddress = `${socket.remoteAddress}:${socket.remotePort}`;
      logToServerUI(`Client connected: ${clientAddress}`);
      clientSockets.add(socket);

      // Store a buffer for this specific client
      let buffer = '';

      // --- Handle data from this client ---
      socket.on('data', (data) => {
        // Add new data to this client's buffer
        buffer += data.toString();

        let boundary = buffer.indexOf('\n'); // Find the first newline
        let logLines = []; // Array to hold all complete log lines

        // Process all complete lines in the buffer
        while (boundary !== -1) {
          const line = buffer.substring(0, boundary).trim(); // Get the line
          buffer = buffer.substring(boundary + 1); // Remove line from buffer

          if (line.length > 0) {
            logLines.push(line);
          }

          boundary = buffer.indexOf('\n'); // Find next newline
        }

        // Queue logs for batch sending
        if (logLines.length > 0) {
          queueLogs(logLines);
        }
      });

      // --- Handle client disconnection ---
      socket.on('close', () => {
        logToServerUI(`Client disconnected: ${clientAddress}`);
        clientSockets.delete(socket);
        
        // Log any remaining data from the buffer
        if (buffer.trim().length > 0) {
            logToServerUI(`Orphaned data from client: ${buffer.trim()}`);
            queueLogs([buffer.trim()]);
        }
      });

      // --- Handle client errors ---
      socket.on('error', (err) => {
        logToServerUI(`Client error (${clientAddress}): ${err.message}`);
      });
    });

    // --- Handle server errors (e.g., "port in use") ---
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logToServerUI(`Error: Port ${port} is already in use.`);
        reject(new Error(`Port ${port} is already in use.`));
      } else {
        logToServerUI(`Server error: ${err.message}`);
        reject(err);
      }
      server = null;
    });

    // --- Start listening ---
    server.listen(port, () => {
      logToServerUI(`Server started and listening on port ${port}`);
      // --- FIX ---
      // DO NOT send status here. We will return it from the
      // 'start-server' handler's promise.
      resolve(); // Resolve the promise
    });
  });
}

/**
 * Stops the TCP log server.
 */
function stopLogServer() {
  return new Promise((resolve) => {
    // Set stopping flag immediately
    isStopping = true; 
    
    if (server) {
      // Stop accepting new connections
      server.close(() => {
        logToServerUI('Server stopped.');
        server = null;
        
        // Clear stopping flag *after* server is fully null
        isStopping = false; 
        
        // --- FIX ---
        // DO NOT send status here. The 'stop-server' handler's
        // promise will signal success.
        resolve();
      });

      // Forcefully close all existing client connections
      logToServerUI(`Closing ${clientSockets.size} client connections...`);
      clientSockets.forEach((socket) => {
        socket.destroy();
      });
      clientSockets.clear();

    } else {
      logToServerUI('Server is not running.');
      // Clear stopping flag
      isStopping = false;
      resolve();
    }
  });
}

// --- Electron App Lifecycle ---

// This method is called when Electron has finished initialization
// and is ready to create browser windows.
app.whenReady().then(() => {
  console.log('DEBUG: app.whenReady() has resolved.');

  // --- IPC Handlers (from UI) ---
  // We register these *before* creating the window to prevent race conditions.

  // 'invoke/handle' pattern for starting the server
  ipcMain.handle('start-server', async (event, port) => {
    console.log('DEBUG: "start-server" handler invoked for port', port);
    
    // Check if server is running OR *in the process of stopping*
    if (server || isStopping) {
      const msg = isStopping ? 'Server is currently stopping. Please wait.' : 'Server is already running.';
      logToServerUI(msg);
      throw new Error(msg);
    }
    
    try {
      await startLogServer(port);
      // --- FIX ---
      // Return success and port number *directly*
      return { success: true, port: port };
    } catch (err) {
      console.error('Failed to start server:', err.message);
      // --- FIX ---
      // DO NOT send status. Just re-throw the error
      // so the UI's 'await' catches it.
      throw err;
    }
  });

  // 'invoke/handle' pattern for stopping the server
  ipcMain.handle('stop-server', async () => {
    console.log('DEBUG: "stop-server" handler invoked.');
    if (!server) {
      logToServerUI('Server is not running.');
      return { success: true }; // Already stopped
    }
    try {
      await stopLogServer();
      // --- FIX ---
      // Return success *directly*
      return { success: true };
    } catch (err) {
      console.error('Failed to stop server:', err.message);
      throw err;
    }
  });

  // Handler for manual log entry
  ipcMain.handle('add-manual-log', async (event, logText) => {
    queueLogs([`[MANUAL] ${logText}`]);
    return { success: true };
  });

  // Now that handlers are registered, create the window.
  createWindow();

  // Handle app activation (e.g., clicking dock icon on macOS)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Create a basic menu (fixes copy/paste on macOS)
  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Ensure server is stopped when app quits
app.on('will-quit', async (event) => {
  if (server) {
    event.preventDefault(); // Prevent app from quitting immediately
    console.log('Stopping server before quitting...');
    await stopLogServer();
    app.quit(); // Now quit
  }
});