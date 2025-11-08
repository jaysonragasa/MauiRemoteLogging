# .NET MAUI Remote Log Viewer

[![NuGet version](https://img.shields.io/nuget/v/jaraio.MauiRemoteLoggingClient.svg)](https://www.nuget.org/packages/jaraio.MauiRemoteLoggingClient/)

A high-performance, real-time remote logging solution for .NET MAUI, **perfect for debugging issues in released applications.**

This project streams logs from your app—whether on a test emulator or a user's device—to a standalone desktop server. It allows you to **capture and analyze errors, warnings, and trace information that you can't reproduce in a local debugging session.**

![alt text](https://raw.githubusercontent.com/jaysonragasa/MauiRemoteLogging/refs/heads/main/Screenshot%202025-11-09%20005924.png)

## Key Features

### Server (Electron App)
* **Live Log Stream:** View logs instantly as they arrive.
* **Log Filtering:** Toggle between `All`, `Error`,`Warn`, `Info`, and `Trace` levels.
* **Dark Mode UI:** Clean, dark-themed interface that's easy on the eyes.
* **Utilities:** Includes line numbers, auto-scroll, clear logs, and export to `.txt`.
* **Status:** Shows server status (Offline, Running, Error) and port.

### Client (NuGet Package)
* **High-Performance & Non-Blocking:** Uses `System.Threading.Channels` for a lock-free, asynchronous producer-consumer pattern. This ensures that logging never blocks your app's UI thread or impacts performance, making it safe for release builds.
* **Resilient Connection:** Automatically retries connection to the server if it's lost, with configurable delay.
* **Clean Integration:** Registers and configures the service with a single, clean line in `MauiProgram.cs`.

## How to Use

### 1. Server (Desktop App)
1.  Navigate to the project directory in your terminal.
2.  Run `npm install` to install Electron and its dependencies.
3.  Run `npm start` to launch the server application.
4.  Click "Start Server" (default port is 8080).

### 2. Client (.NET MAUI App)

1.  **Install the NuGet Package** into your .NET MAUI project:
    ```bash
    dotnet add package jaraio.MauiRemoteLoggingClient
    ```
    Or add it via the Visual Studio NuGet Package Manager.

2.  In `MauiProgram.cs`, register the service using the extension method.
    ```csharp
    // Add the namespace from the package
    using Jaraio.MauiRemoteLogging; 

    public static class MauiProgram
    {
        public static MauiApp CreateMauiApp()
        {
            var builder = MauiApp.CreateBuilder();
            builder
                .UseMauiApp<App>()
                .ConfigureFonts(fonts =>
                {
                    // ...
                });

            // Add this line to register the logging service
            // Use your server's local IP and the port from the Electron app
            builder.ConfigureRemoteLogging("YOUR_SERVER_IP_HERE", 8080);

            // ... register other services
            
            return builder.Build();
        }
    }
    ```

3.  Inject `IRemoteLoggingClientService` into any ViewModel or service and start logging.
    ```csharp
    // Add the namespace from the package
    using Jaraio.MauiRemoteLogging; 

    public class MyViewModel
    {
        private readonly IRemoteLoggingClientService _logger;

        public MyViewModel(IRemoteLoggingClientService logger)
        {
            _logger = logger;
        }

        public void DoSomething()
        {
            // Use the EnqueueLog method
            _logger.EnqueueLog(LogLevel.Info, "MyViewModel", "Button was clicked!", null, "DoSomething");
            
            try
            {
                // ... code that might fail
            }
            catch (Exception ex)
            {
                _logger.EnqueueLog(LogLevel.Error, "MyViewModel", "Something bad happened.", ex, "DoSomething");
            }
        }
    }
    ```

## Tech Stack
* **Server:** Electron, Node.js (TCP Server), Tailwind CSS
* **Client:** .NET, `TcpClient`, `System.Threading.Channels` (via NuGet)
