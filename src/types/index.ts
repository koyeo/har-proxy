/**
 * Type definitions for HAR file structure and internal models
 */

// HAR File Structure (Input) - HAR 1.2 specification
export interface HarFile {
  log: {
    version: string;
    creator: { name: string; version: string };
    entries: HarLogEntry[];
  };
}

export interface HarLogEntry {
  startedDateTime: string;
  request: {
    method: string;
    url: string;
    headers: { name: string; value: string }[];
    queryString: { name: string; value: string }[];
  };
  response: {
    status: number;
    headers: { name: string; value: string }[];
    content: {
      size: number;
      mimeType: string;
      text?: string;
      encoding?: string; // "base64" if encoded
    };
  };
}

// Internal Models
export interface QueryParam {
  name: string;
  value: string;
}

export interface Header {
  name: string;
  value: string;
}

export interface HarEntry {
  method: string;
  url: string;
  path: string;
  queryString: QueryParam[];
  requestHeaders: Header[];
  status: number;
  responseHeaders: Header[];
  responseBody: string;
  contentType: string;
  timestamp: string;
}

export interface ParseResult {
  entries: HarEntry[];
  errors: string[];
}

// CLI Options
export interface CLIOptions {
  harFile: string;
  port: number;
  help: boolean;
  version: boolean;
}

// Server Configuration
export interface ServerConfig {
  port: number;
  entries: HarEntry[];
}

export interface EndpointMap {
  [key: string]: HarEntry; // key format: "METHOD:path"
}

// Dashboard Types
export interface EndpointGroup {
  basePath: string;
  endpoints: EndpointInfo[];
}

export interface EndpointInfo {
  method: string;
  path: string;
  status: number;
  contentType: string;
}
