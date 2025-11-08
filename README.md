![alt text](https://raw.githubusercontent.com/jaysonragasa/MauiRemoteLogging/refs/heads/main/Screenshot%202025-11-09%20005924.png)

# .NET MAUI Remote Log Viewer

A high-performance, real-time remote logging solution for .NET MAUI applications.

This project provides a way to send logs directly from your .NET MAUI app (running on a physical device or emulator) to a standalone desktop application. It's like having a persistent "Output" window that works over your local network, making it perfect for debugging on-device issues.



## Key Features

### Server (Electron App)
* **Live Log Stream:** View logs instantly as they arrive.
* **Log Filtering:** Toggle between `All`, `Error`,`Warn`, `Info`, and `Trace` levels.
* **Dark Mode UI:** Clean, dark-themed interface that's easy on the eyes.
* **Utilities:** Includes line numbers, auto-scroll, clear logs, and export to `.txt`.
* **Status:** Shows server status (Offline, Running, Error) and port.

### Client (.NET MAUI Service)
* **High-Performance Queue:** Uses `System.Threading.Channels` for a lock-free, asynchronous producer-consumer pattern that never blocks your UI thread.
* **Resilient:** Automatically retries connection to the server if it's lost, with configurable delay.
* **Clean Integration:** Registers and configures the service with a single, clean line in `MauiProgram.cs`.

## How to Use

### 1. Server (Desktop App)
1.  Clone this repository.
2.  Navigate to the project directory in your terminal.
3.  Run `npm install` to install Electron and its dependencies.
4.  Run `npm start` to launch the server application.
5.  Click "Start Server" (default port is 8080).

### 2. Client (.NET MAUI App)
1.  Add `RemoteLoggingClientService.cs` to your .NET MAUI project.
2.  In `MauiProgram.cs`, register the service using the new extension method. This is the only setup required.

    ```csharp
    using MauiRemoteLogging; // Add the namespace for your service

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
            builder.ConfigureRemoteLogging("YOUR_LOCAL_IP_HERE", 8080);

            // ... register other services
            
            return builder.Build();
        }
    }
    ```

3.  Inject `IRemoteLoggingClientService` into any ViewModel or service and start logging.

    ```csharp
    using MauiRemoteLogging; // Use the correct namespace

    public class MyViewModel
    {
        private readonly IRemoteLoggingClientService _logger;

        public MyViewModel(IRemoteLoggingClientService logger)
        {
            _logger = logger;
        }

        public void DoSomething()
        {
            // Use the new EnqueueLog method
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
* **Client:** .NET C#, `TcpClient`, `System.Threading.Channels`
