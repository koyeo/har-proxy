/**
 * HAR Parser Module
 * Parses HAR files and extracts endpoint data
 */

import { readFile } from 'node:fs/promises';
import type { HarFile, HarLogEntry, HarEntry, ParseResult, Header, QueryParam } from './types/index.js';

/**
 * Decodes base64 encoded content
 */
export function decodeBase64(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf-8');
}

/**
 * Encodes string content to base64
 */
export function encodeBase64(content: string): string {
  return Buffer.from(content, 'utf-8').toString('base64');
}

/**
 * Extracts the path from a URL string
 */
export function extractPath(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname;
  } catch {
    // If URL parsing fails, try to extract path manually
    const match = url.match(/^https?:\/\/[^/]+(\/[^?]*)?/);
    return match?.[1] || '/';
  }
}

/**
 * Finds the content-type from response headers
 */
export function findContentType(headers: Header[]): string {
  const contentTypeHeader = headers.find(
    (h) => h.name.toLowerCase() === 'content-type'
  );
  return contentTypeHeader?.value || 'application/octet-stream';
}

/**
 * Transforms a HAR log entry into our internal HarEntry format
 */
export function transformEntry(logEntry: HarLogEntry): HarEntry {
  const { request, response, startedDateTime } = logEntry;
  
  // Extract response body, handling base64 encoding
  let responseBody = '';
  if (response.content.text) {
    if (response.content.encoding === 'base64') {
      responseBody = decodeBase64(response.content.text);
    } else {
      responseBody = response.content.text;
    }
  }

  const responseHeaders: Header[] = response.headers.map((h) => ({
    name: h.name,
    value: h.value,
  }));

  return {
    method: request.method.toUpperCase(),
    url: request.url,
    path: extractPath(request.url),
    queryString: request.queryString.map((q) => ({
      name: q.name,
      value: q.value,
    })),
    requestHeaders: request.headers.map((h) => ({
      name: h.name,
      value: h.value,
    })),
    status: response.status,
    responseHeaders,
    responseBody,
    contentType: findContentType(responseHeaders),
    timestamp: startedDateTime,
  };
}

/**
 * Validates that the parsed JSON has the expected HAR structure
 */
export function validateHarStructure(data: unknown): data is HarFile {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  
  const har = data as Record<string, unknown>;
  if (typeof har.log !== 'object' || har.log === null) {
    return false;
  }
  
  const log = har.log as Record<string, unknown>;
  if (!Array.isArray(log.entries)) {
    return false;
  }
  
  return true;
}

/**
 * Parses a HAR file from disk and extracts all entries
 */
export async function parseHarFile(filePath: string): Promise<ParseResult> {
  const entries: HarEntry[] = [];
  const errors: string[] = [];

  try {
    const content = await readFile(filePath, 'utf-8');
    
    let harData: unknown;
    try {
      harData = JSON.parse(content);
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      errors.push(`Invalid JSON format: ${error}`);
      return { entries, errors };
    }

    if (!validateHarStructure(harData)) {
      errors.push('Invalid HAR file structure: missing log.entries array');
      return { entries, errors };
    }

    for (let i = 0; i < harData.log.entries.length; i++) {
      try {
        const entry = transformEntry(harData.log.entries[i]);
        entries.push(entry);
      } catch (e) {
        const error = e instanceof Error ? e.message : 'Unknown error';
        errors.push(`Error parsing entry ${i}: ${error}`);
      }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    errors.push(`Failed to read file: ${error}`);
  }

  return { entries, errors };
}


/**
 * Generates a text representation of a HarEntry for debugging purposes
 * Format: METHOD PATH STATUS CONTENT-TYPE [TIMESTAMP]
 * Headers and body are included on subsequent lines
 */
export function formatEntry(entry: HarEntry): string {
  const lines: string[] = [];
  
  // First line: summary
  lines.push(`${entry.method} ${entry.path} ${entry.status} ${entry.contentType} [${entry.timestamp}]`);
  
  // Request headers
  if (entry.requestHeaders.length > 0) {
    lines.push('Request Headers:');
    for (const header of entry.requestHeaders) {
      lines.push(`  ${header.name}: ${header.value}`);
    }
  }
  
  // Query parameters
  if (entry.queryString.length > 0) {
    lines.push('Query Parameters:');
    for (const param of entry.queryString) {
      lines.push(`  ${param.name}=${param.value}`);
    }
  }
  
  // Response headers
  if (entry.responseHeaders.length > 0) {
    lines.push('Response Headers:');
    for (const header of entry.responseHeaders) {
      lines.push(`  ${header.name}: ${header.value}`);
    }
  }
  
  // Response body (truncated for display)
  if (entry.responseBody) {
    lines.push('Response Body:');
    const bodyPreview = entry.responseBody.length > 200 
      ? entry.responseBody.substring(0, 200) + '...'
      : entry.responseBody;
    lines.push(`  ${bodyPreview}`);
  }
  
  return lines.join('\n');
}

/**
 * Parses a formatted entry text back into a HarEntry structure
 * This is the inverse of formatEntry for round-trip testing
 */
export function parseFormattedEntry(text: string): HarEntry {
  const lines = text.split('\n');
  
  // Parse first line: METHOD PATH STATUS CONTENT-TYPE [TIMESTAMP]
  const firstLine = lines[0];
  const match = firstLine.match(/^(\S+)\s+(\S+)\s+(\d+)\s+(\S+)\s+\[(.+)\]$/);
  
  if (!match) {
    throw new Error(`Invalid format: ${firstLine}`);
  }
  
  const [, method, path, statusStr, contentType, timestamp] = match;
  
  const entry: HarEntry = {
    method,
    url: `http://localhost${path}`,
    path,
    queryString: [],
    requestHeaders: [],
    status: parseInt(statusStr, 10),
    responseHeaders: [],
    responseBody: '',
    contentType,
    timestamp,
  };
  
  let currentSection = '';
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    
    if (line === 'Request Headers:') {
      currentSection = 'requestHeaders';
    } else if (line === 'Query Parameters:') {
      currentSection = 'queryParams';
    } else if (line === 'Response Headers:') {
      currentSection = 'responseHeaders';
    } else if (line === 'Response Body:') {
      currentSection = 'body';
    } else if (line.startsWith('  ')) {
      const content = line.substring(2);
      
      if (currentSection === 'requestHeaders' || currentSection === 'responseHeaders') {
        const colonIndex = content.indexOf(': ');
        if (colonIndex > 0) {
          const header = {
            name: content.substring(0, colonIndex),
            value: content.substring(colonIndex + 2),
          };
          if (currentSection === 'requestHeaders') {
            entry.requestHeaders.push(header);
          } else {
            entry.responseHeaders.push(header);
          }
        }
      } else if (currentSection === 'queryParams') {
        const eqIndex = content.indexOf('=');
        if (eqIndex > 0) {
          entry.queryString.push({
            name: content.substring(0, eqIndex),
            value: content.substring(eqIndex + 1),
          });
        }
      } else if (currentSection === 'body') {
        entry.responseBody = content.endsWith('...') 
          ? content.substring(0, content.length - 3)
          : content;
      }
    }
  }
  
  return entry;
}
