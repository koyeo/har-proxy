/**
 * Mock Server Module
 * Creates and manages the HTTP mock server
 */

import { createServer as createHttpServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { HarEntry, ServerConfig, EndpointMap, CorsHeaders } from './types/index.js';

/**
 * Default CORS headers for cross-origin requests
 */
export const DEFAULT_CORS_HEADERS: CorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
};

/**
 * Proxy path prefix for all HAR-recorded endpoints
 * This separates HAR endpoints from internal routes (dashboard, health checks, etc.)
 */
export const PROXY_PREFIX = '/proxy';

/**
 * Converts an original path to a proxy-prefixed path
 * @param originalPath - The original path from HAR entry (e.g., "/api/users")
 * @returns The proxy-prefixed path (e.g., "/proxy/api/users")
 */
export function getProxyPath(originalPath: string): string {
  return PROXY_PREFIX + originalPath;
}

/**
 * Strips query parameters from a URL path
 * @param urlPath - The URL path potentially containing query parameters
 * @returns The path without query parameters
 */
export function stripQueryParams(urlPath: string): string {
  const queryIndex = urlPath.indexOf('?');
  return queryIndex === -1 ? urlPath : urlPath.substring(0, queryIndex);
}

/**
 * Builds an endpoint map from parsed HAR entries
 * Key format: "METHOD:/proxy{path}"
 * Later entries override earlier ones (latest wins)
 */
export function buildEndpointMap(entries: HarEntry[]): EndpointMap {
  const map: EndpointMap = {};
  
  for (const entry of entries) {
    const proxyPath = getProxyPath(entry.path);
    const key = `${entry.method}:${proxyPath}`;
    map[key] = entry;
  }
  
  return map;
}

/**
 * Finds a matching entry for the given method and path
 */
export function findMatchingEntry(
  method: string,
  path: string,
  map: EndpointMap
): HarEntry | null {
  const key = `${method.toUpperCase()}:${path}`;
  return map[key] || null;
}

/**
 * Gets the count of unique endpoints in the map
 */
export function getEndpointCount(map: EndpointMap): number {
  return Object.keys(map).length;
}

/**
 * Request logger type for CLI output
 */
export type RequestLogger = (method: string, path: string, status: number) => void;

/**
 * Applies CORS headers to a response
 * @param headers - The headers object to add CORS headers to
 */
export function applyCorsHeaders(headers: Record<string, string>): void {
  headers['Access-Control-Allow-Origin'] = DEFAULT_CORS_HEADERS['Access-Control-Allow-Origin'];
  headers['Access-Control-Allow-Methods'] = DEFAULT_CORS_HEADERS['Access-Control-Allow-Methods'];
  headers['Access-Control-Allow-Headers'] = DEFAULT_CORS_HEADERS['Access-Control-Allow-Headers'];
}

/**
 * Handles preflight OPTIONS requests for CORS
 * @param res - The server response object
 */
export function handlePreflightRequest(res: ServerResponse): void {
  const headers: Record<string, string> = {};
  applyCorsHeaders(headers);
  res.writeHead(204, headers);
  res.end();
}

/**
 * Creates the HTTP request handler
 */
export function createRequestHandler(
  endpointMap: EndpointMap,
  dashboardHandler: (res: ServerResponse) => void,
  cors: boolean = true,
  logger?: RequestLogger
) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method?.toUpperCase() || 'GET';
    // Strip query parameters from URL for matching - only use path portion
    const rawUrl = req.url || '/';
    const path = stripQueryParams(rawUrl);

    // Serve dashboard at root (internal route)
    if (path === '/' && method === 'GET') {
      dashboardHandler(res);
      logger?.(method, path, 200);
      return;
    }

    // Handle preflight OPTIONS requests for CORS
    if (method === 'OPTIONS' && cors && path.startsWith(PROXY_PREFIX)) {
      handlePreflightRequest(res);
      logger?.(method, path, 204);
      return;
    }

    // Only handle requests under /proxy/* for HAR endpoints
    if (!path.startsWith(PROXY_PREFIX)) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (cors) {
        applyCorsHeaders(headers);
      }
      res.writeHead(404, headers);
      res.end(JSON.stringify({ 
        error: 'Not Found', 
        message: `Path ${path} is not a proxy endpoint. HAR endpoints are available under ${PROXY_PREFIX}/*` 
      }));
      logger?.(method, path, 404);
      return;
    }

    // Find matching entry in the proxy namespace
    const entry = findMatchingEntry(method, path, endpointMap);

    if (!entry) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (cors) {
        applyCorsHeaders(headers);
      }
      res.writeHead(404, headers);
      res.end(JSON.stringify({ error: 'Not Found', message: `No matching entry for ${method} ${path}` }));
      logger?.(method, path, 404);
      return;
    }

    // Set response headers from recorded entry
    const headers: Record<string, string> = {};
    for (const header of entry.responseHeaders) {
      // Skip certain headers that shouldn't be forwarded
      const lowerName = header.name.toLowerCase();
      if (lowerName !== 'content-encoding' && 
          lowerName !== 'transfer-encoding' &&
          lowerName !== 'content-length') {
        headers[header.name] = header.value;
      }
    }

    // Ensure content-type is set
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = entry.contentType;
    }

    // Apply CORS headers if enabled
    if (cors) {
      applyCorsHeaders(headers);
    }

    res.writeHead(entry.status, headers);
    res.end(entry.responseBody);
    logger?.(method, path, entry.status);
  };
}

/**
 * Creates and returns the HTTP mock server
 */
export function createServer(
  config: ServerConfig,
  dashboardHandler: (res: ServerResponse) => void,
  logger?: RequestLogger
): Server {
  const endpointMap = buildEndpointMap(config.entries);
  const cors = config.cors ?? true; // Default to true if not specified
  const handler = createRequestHandler(endpointMap, dashboardHandler, cors, logger);
  
  return createHttpServer(handler);
}

/**
 * Starts the server and returns a promise that resolves when listening
 */
export function startServer(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Try a different port with --port option.`));
      } else {
        reject(err);
      }
    });

    server.listen(port, () => {
      resolve();
    });
  });
}
