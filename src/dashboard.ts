/**
 * Dashboard Module
 * Generates the HTML dashboard for viewing endpoints
 */

import type { HarEntry, EndpointGroup, EndpointInfo } from './types/index.js';

/**
 * Extracts the base path (first path segment) from a full path
 */
export function getBasePath(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return segments.length > 0 ? `/${segments[0]}` : '/';
}

/**
 * Converts a HarEntry to EndpointInfo for dashboard display
 */
export function toEndpointInfo(entry: HarEntry): EndpointInfo {
  return {
    method: entry.method,
    path: entry.path,
    status: entry.status,
    contentType: entry.contentType,
  };
}

/**
 * Groups entries by their base path (first path segment)
 * Sorts groups and endpoints within groups alphabetically
 */
export function groupEndpoints(entries: HarEntry[]): EndpointGroup[] {
  const groups = new Map<string, EndpointInfo[]>();

  for (const entry of entries) {
    const basePath = getBasePath(entry.path);
    const info = toEndpointInfo(entry);

    if (!groups.has(basePath)) {
      groups.set(basePath, []);
    }
    groups.get(basePath)!.push(info);
  }

  // Convert to array and sort
  const result: EndpointGroup[] = [];
  for (const [basePath, endpoints] of groups) {
    // Sort endpoints by path, then by method
    endpoints.sort((a, b) => {
      const pathCompare = a.path.localeCompare(b.path);
      if (pathCompare !== 0) return pathCompare;
      return a.method.localeCompare(b.method);
    });

    result.push({ basePath, endpoints });
  }

  // Sort groups by base path
  result.sort((a, b) => a.basePath.localeCompare(b.basePath));

  return result;
}

/**
 * Gets the CSS class for HTTP method badge
 */
function getMethodClass(method: string): string {
  const classes: Record<string, string> = {
    GET: 'method-get',
    POST: 'method-post',
    PUT: 'method-put',
    DELETE: 'method-delete',
    PATCH: 'method-patch',
  };
  return classes[method] || 'method-other';
}

/**
 * Gets the CSS class for status code badge
 */
function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return 'status-success';
  if (status >= 300 && status < 400) return 'status-redirect';
  if (status >= 400 && status < 500) return 'status-client-error';
  if (status >= 500) return 'status-server-error';
  return 'status-info';
}

/**
 * Escapes HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generates the HTML dashboard page
 */
export function generateDashboard(entries: HarEntry[]): string {
  const groups = groupEndpoints(entries);
  const totalEndpoints = entries.length;

  const groupsHtml = groups
    .map(
      (group) => `
    <div class="group">
      <h2 class="group-title">${escapeHtml(group.basePath)}</h2>
      <div class="endpoints">
        ${group.endpoints
          .map(
            (ep) => `
          <div class="endpoint">
            <span class="method ${getMethodClass(ep.method)}">${escapeHtml(ep.method)}</span>
            <span class="path">${escapeHtml(ep.path)}</span>
            <span class="status ${getStatusClass(ep.status)}">${ep.status}</span>
            <span class="content-type">${escapeHtml(ep.contentType)}</span>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HAR Proxy Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      background: #2c3e50;
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    header h1 { font-size: 24px; margin-bottom: 5px; }
    header p { opacity: 0.8; font-size: 14px; }
    .group {
      background: white;
      border-radius: 8px;
      margin-bottom: 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .group-title {
      background: #34495e;
      color: white;
      padding: 12px 16px;
      font-size: 16px;
      font-weight: 600;
    }
    .endpoints { padding: 8px; }
    .endpoint {
      display: flex;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid #eee;
      gap: 12px;
    }
    .endpoint:last-child { border-bottom: none; }
    .method {
      font-weight: 600;
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 4px;
      min-width: 60px;
      text-align: center;
    }
    .method-get { background: #27ae60; color: white; }
    .method-post { background: #3498db; color: white; }
    .method-put { background: #f39c12; color: white; }
    .method-delete { background: #e74c3c; color: white; }
    .method-patch { background: #9b59b6; color: white; }
    .method-other { background: #95a5a6; color: white; }
    .path {
      flex: 1;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 14px;
      color: #2c3e50;
    }
    .status {
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: 600;
    }
    .status-success { background: #d4edda; color: #155724; }
    .status-redirect { background: #fff3cd; color: #856404; }
    .status-client-error { background: #f8d7da; color: #721c24; }
    .status-server-error { background: #f5c6cb; color: #721c24; }
    .status-info { background: #d1ecf1; color: #0c5460; }
    .content-type {
      font-size: 12px;
      color: #7f8c8d;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>HAR Proxy Dashboard</h1>
      <p>${totalEndpoints} endpoint${totalEndpoints !== 1 ? 's' : ''} loaded</p>
    </header>
    ${groupsHtml || '<p style="text-align: center; padding: 40px; color: #7f8c8d;">No endpoints loaded</p>'}
  </div>
</body>
</html>`;
}
