/**
 * har-proxy - Main entry point
 * A CLI tool that parses HAR files and creates a RESTful mock server
 */

// Export types
export * from './types/index.js';

// Export parser functions
export {
  parseHarFile,
  transformEntry,
  decodeBase64,
  encodeBase64,
  extractPath,
  findContentType,
  formatEntry,
  parseFormattedEntry,
  validateHarStructure,
} from './parser.js';

// Export server functions
export {
  createServer,
  startServer,
  buildEndpointMap,
  findMatchingEntry,
  getEndpointCount,
  createRequestHandler,
} from './server.js';

// Export dashboard functions
export {
  generateDashboard,
  groupEndpoints,
  getBasePath,
  toEndpointInfo,
} from './dashboard.js';

// Export CLI functions
export {
  createProgram,
  validateHarFile,
  createLogger,
  runServer,
} from './cli.js';
