using System.Net.Sockets;
using System.Threading.Channels;

namespace MauiRemoteLogging;

/// <summary>
/// Represents the severity level of a log entry.
/// </summary>
public enum LogLevel
{
	/// <summary>Trace level logging for detailed diagnostic information.</summary>
	Trace,
	/// <summary>Info level logging for general information.</summary>
	Info,
	/// <summary>Warning level logging for potentially harmful situations.</summary>
	Warning,
	/// <summary>Error level logging for error events.</summary>
	Error
}

/// <summary>
/// Interface for remote logging client service that sends logs to a TCP server.
/// </summary>
public interface IRemoteLoggingClientService : IDisposable
{
	/// <summary>Gets or sets the host address for the remote logging server.</summary>
	string HostAddress { get; set; }
	/// <summary>Gets or sets the port number for the remote logging server.</summary>
	int PortNumber { get; set; }
	/// <summary>Gets or sets the retry delay in milliseconds when connection fails.</summary>
	int RetryDelay { get; set; }

	/// <summary>Enqueues a log message for remote transmission.</summary>
	/// <param name="logMessage">The formatted log message to send.</param>
	void EnqueueLog(string logMessage);
	/// <summary>Enqueues a structured log entry for remote transmission.</summary>
	/// <param name="level">The log level.</param>
	/// <param name="source">The source class or component.</param>
	/// <param name="message">The log message.</param>
	/// <param name="exception">Optional exception details.</param>
	/// <param name="methodName">The calling method name.</param>
	void EnqueueLog(LogLevel level, string source, string message, Exception exception, string methodName);
}

/// <summary>
/// Remote logging client service that uses producer-consumer pattern to send logs to a TCP server.
/// Automatically handles connection failures and retries.
/// </summary>
public class RemoteLoggingClientService : IRemoteLoggingClientService
{
	private readonly Channel<string> _channel;
	private readonly ChannelWriter<string> _writer;
	private readonly CancellationTokenSource _cancellationTokenSource = new();
	private readonly Task _consumerTask;
	private TcpClient _client;
	private StreamWriter _streamWriter;
	private bool _isConnected;
	private readonly object _connectionLock = new();

	/// <summary>Gets or sets the host address for the remote logging server. Default is "192.168.1.60".</summary>
	public string HostAddress { get; set; } = "192.168.1.60";
	/// <summary>Gets or sets the port number for the remote logging server. Default is 8080.</summary>
	public int PortNumber { get; set; } = 8080;
	/// <summary>Gets or sets the retry delay in milliseconds when connection fails. Default is 5000ms.</summary>
	public int RetryDelay { get; set; } = 5000;

	/// <summary>
	/// Initializes a new instance of the RemoteLoggingClientService.
	/// Starts the background consumer task for processing log entries.
	/// </summary>
	public RemoteLoggingClientService()
	{
		_channel = Channel.CreateUnbounded<string>();
		_writer = _channel.Writer;
		_consumerTask = Task.Run(ConsumeLogEntries);
	}

	/// <summary>
	/// Enqueues a formatted log message for remote transmission.
	/// </summary>
	/// <param name="logMessage">The formatted log message to send.</param>
	public void EnqueueLog(string logMessage)
	{
		_writer.TryWrite(logMessage);
	}

	/// <summary>
	/// Enqueues a structured log entry for remote transmission.
	/// </summary>
	/// <param name="level">The log level.</param>
	/// <param name="source">The source class or component.</param>
	/// <param name="message">The log message.</param>
	/// <param name="exception">Optional exception details.</param>
	/// <param name="methodName">The calling method name.</param>
	public void EnqueueLog(LogLevel level, string source, string message, Exception exception, string methodName)
	{
		var logEntry = $"[{level}] [{source}::{methodName}] {message}";
		if (exception != null)
		{
			logEntry += $"{Environment.NewLine}{exception}";
		}

		EnqueueLog(logEntry);
	}

	/// <summary>
	/// Background consumer task that processes queued log entries and sends them to the remote server.
	/// </summary>
	private async Task ConsumeLogEntries()
	{
		await foreach (var logMessage in _channel.Reader.ReadAllAsync(_cancellationTokenSource.Token))
		{
			if (!_isConnected)
			{
				await ConnectWithRetryAsync();
			}

			if (_isConnected)
			{
				await SendLogAsync(logMessage);
			}
		}
	}

	/// <summary>
	/// Attempts to connect to the remote server with automatic retry on failure.
	/// </summary>
	private async Task ConnectWithRetryAsync()
	{
		while (!_isConnected && !_cancellationTokenSource.Token.IsCancellationRequested)
		{
			try
			{
				lock (_connectionLock)
				{
					_client?.Dispose();
					_client = new TcpClient();
				}

				await _client.ConnectAsync(HostAddress, PortNumber);

				lock (_connectionLock)
				{
					_streamWriter = new StreamWriter(_client.GetStream()) { AutoFlush = true };
					_isConnected = true;
				}
			}
			catch
			{
				_isConnected = false;
				await Task.Delay(RetryDelay, _cancellationTokenSource.Token);
			}
		}
	}

	/// <summary>
	/// Sends a log message to the remote server. Sets disconnected flag on failure.
	/// </summary>
	/// <param name="logMessage">The log message to send.</param>
	private async Task SendLogAsync(string logMessage)
	{
		try
		{
			await _streamWriter.WriteLineAsync(logMessage);
		}
		catch
		{
			_isConnected = false;
			lock (_connectionLock)
			{
				_streamWriter?.Dispose();
				_client?.Dispose();
			}
		}
	}

	/// <summary>
	/// Disposes the service, stopping the consumer task and cleaning up resources.
	/// </summary>
	public void Dispose()
	{
		_writer.Complete();
		_cancellationTokenSource.Cancel();
		_consumerTask?.Wait(1000);

		lock (_connectionLock)
		{
			_streamWriter?.Dispose();
			_client?.Dispose();
		}

		_cancellationTokenSource.Dispose();
	}
}

/// <summary>
/// 
/// </summary>
public static class RemoteLoggingServiceCollectionExtensions
{
	/// <summary>
	/// Configures remote logging for the application by setting up a remote logging client service.
	/// </summary>
	/// <remarks>This method adds a singleton service of type <see cref="IRemoteLoggingClientService"/> to the
	/// application's service collection. The service is configured to connect to the specified remote logging server using
	/// the provided host address and port number.</remarks>
	/// <param name="builder">The <see cref="MauiAppBuilder"/> instance to configure.</param>
	/// <param name="hostAddress">The address of the remote logging server. Cannot be null or empty.</param>
	/// <param name="portNumber">The port number on which the remote logging server is listening. Must be a valid port number (0-65535).</param>
	/// <returns>The configured <see cref="MauiAppBuilder"/> instance, allowing for further configuration chaining.</returns>
	public static MauiAppBuilder ConfigureRemoteLogging(this MauiAppBuilder builder, string hostAddress, int portNumber)
	{
		builder.Services.AddSingleton<IRemoteLoggingClientService>(sp =>
		{
			var service = new RemoteLoggingClientService();
			service.HostAddress = hostAddress;
			service.PortNumber = portNumber;
			return service;
		});
		return builder;
	}
}