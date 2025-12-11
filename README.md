# HAR Proxy

A CLI tool that parses HAR (HTTP Archive) files and creates a RESTful mock server. Perfect for API mocking, testing, and development without backend dependencies.

## Installation

```bash
# Using npm
npm install -g har-proxy

# Using pnpm
pnpm add -g har-proxy

# Or run directly with npx
npx har-proxy <har-file>
```

### Requirements

- Node.js >= 18.0.0

## Usage

```bash
har-proxy <har-file> [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <number>` | Port to run the server on | `3000` |
| `--no-cors` | Disable automatic CORS header injection | CORS enabled |
| `-V, --version` | Output the version number | - |
| `-h, --help` | Display help information | - |

### Examples

```bash
# Start server with default port (3000)
har-proxy recording.har

# Start server on custom port
har-proxy recording.har --port 8080
har-proxy recording.har -p 8080

# Disable automatic CORS headers (use original HAR CORS headers)
har-proxy recording.har --no-cors
```

## CORS Support

By default, har-proxy automatically adds CORS headers to all responses, allowing cross-origin requests from any domain:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With`

The server also handles preflight OPTIONS requests automatically.

### Disabling CORS

Use `--no-cors` when:
- Your HAR file already contains custom CORS headers you want to preserve
- You need to test CORS behavior with specific origins
- Your frontend handles CORS differently

```bash
har-proxy recording.har --no-cors
```

When CORS is disabled, any CORS headers present in the original HAR recording will be preserved.

## Important: Proxy Path

**All HAR-recorded endpoints are served under the `/proxy` path prefix.**

For example, if your HAR file contains a request to `/api/users`, it will be available at:

```
http://localhost:3000/proxy/api/users
```

This design separates HAR endpoints from internal routes (dashboard, health checks, etc.).

### Path Mapping Examples

| Original HAR Path | Proxy Server Path |
|-------------------|-------------------|
| `/api/users` | `/proxy/api/users` |
| `/api/products/123` | `/proxy/api/products/123` |
| `/v1/auth/login` | `/proxy/v1/auth/login` |

## Dashboard

After starting the server, a web dashboard is available at the root path:

```
http://localhost:3000/
```

The dashboard displays all loaded endpoints grouped by base path, showing:
- HTTP method (GET, POST, PUT, DELETE, PATCH)
- Full endpoint path
- Response status code
- Content type

![HAR Proxy Dashboard](docs/dashboard-screenshot.png)

## Quick Start Example

1. Export a HAR file from your browser's DevTools (Network tab → Right-click → Save all as HAR)

2. Start the proxy server:
   ```bash
   har-proxy my-api-recording.har -p 3000
   ```

3. Output:
   ```
   Loading HAR file: /path/to/my-api-recording.har

   🚀 HAR Proxy server running at http://localhost:3000
   📊 Dashboard available at http://localhost:3000/
   📦 Loaded 15 endpoints
   🌐 CORS: enabled (default)

   Press Ctrl+C to stop the server
   ```

4. Access your mocked endpoints:
   ```bash
   # If HAR contained GET /api/users
   curl http://localhost:3000/proxy/api/users
   ```

## How It Works

1. **Parse**: Reads and parses the HAR file to extract HTTP request/response pairs
2. **Map**: Creates an endpoint map where later entries override earlier ones (latest wins)
3. **Serve**: Starts an HTTP server that matches incoming requests to recorded responses
4. **Dashboard**: Generates an HTML dashboard for easy endpoint discovery

## Use Cases

- **Frontend Development**: Mock backend APIs during UI development
- **Testing**: Create reproducible test environments with recorded responses
- **Demos**: Showcase applications without live backend dependencies
- **Debugging**: Replay specific API scenarios for troubleshooting

## License

ISC
