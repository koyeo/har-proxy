/**
 * Property-based tests for Mock Server module
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  buildEndpointMap,
  findMatchingEntry,
  getEndpointCount,
  getProxyPath,
  PROXY_PREFIX,
  DEFAULT_CORS_HEADERS,
  applyCorsHeaders,
  createRequestHandler,
} from '../src/server.js';
import type { HarEntry, EndpointMap } from '../src/types/index.js';
import type { ServerResponse } from 'node:http';

// Generators for server tests
const httpMethodArb = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS');

const pathArb = fc.string({ minLength: 1, maxLength: 50 })
  .map((s) => '/' + s.replace(/[^a-zA-Z0-9/._-]/g, ''));

const statusCodeArb = fc.integer({ min: 100, max: 599 });

const mimeTypeArb = fc.constantFrom(
  'application/json',
  'text/html',
  'text/plain',
  'application/xml'
);

const headerArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim() === s),
  value: fc.string({ maxLength: 100 }),
});

const harEntryArb: fc.Arbitrary<HarEntry> = fc.record({
  method: httpMethodArb,
  url: fc.constant('http://localhost'),
  path: pathArb,
  queryString: fc.constant([]),
  requestHeaders: fc.array(headerArb, { maxLength: 3 }),
  status: statusCodeArb,
  responseHeaders: fc.array(headerArb, { maxLength: 3 }),
  responseBody: fc.string({ maxLength: 200 }),
  contentType: mimeTypeArb,
  timestamp: fc.date().map((d) => d.toISOString()),
});

describe('Mock Server', () => {
  /**
   * **Feature: har-proxy, Property 11: Proxy Path Prefix Consistency**
   * *For any* HAR entry with path P, the endpoint SHALL be registered and accessible
   * at `/proxy` + P, ensuring no conflicts with internal routes.
   * **Validates: Requirements 3.6**
   */
  describe('Property 11: Proxy Path Prefix Consistency', () => {
    it('should prefix all paths with /proxy and make them accessible only at proxy path', () => {
      fc.assert(
        fc.property(
          fc.array(harEntryArb, { minLength: 1, maxLength: 10 }),
          (entries) => {
            const map = buildEndpointMap(entries);
            
            for (const entry of entries) {
              const originalPath = entry.path;
              const proxyPath = getProxyPath(originalPath);
              
              // Verify proxy path starts with PROXY_PREFIX
              expect(proxyPath).toBe(PROXY_PREFIX + originalPath);
              
              // Entry should be accessible at proxy path
              const foundAtProxy = findMatchingEntry(entry.method, proxyPath, map);
              expect(foundAtProxy).not.toBeNull();
              expect(foundAtProxy!.path).toBe(originalPath);
              
              // Entry should NOT be accessible at original path (unless original path happens to start with /proxy)
              if (!originalPath.startsWith(PROXY_PREFIX)) {
                const foundAtOriginal = findMatchingEntry(entry.method, originalPath, map);
                expect(foundAtOriginal).toBeNull();
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getProxyPath should always prepend /proxy prefix', () => {
      fc.assert(
        fc.property(pathArb, (path) => {
          const proxyPath = getProxyPath(path);
          
          expect(proxyPath).toBe(PROXY_PREFIX + path);
          expect(proxyPath.startsWith(PROXY_PREFIX)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: har-proxy, Property 4: Request-Response Matching**
   * *For any* registered endpoint entry, sending an HTTP request with the same
   * method and proxy-prefixed path SHALL return the recorded response with matching status code.
   * **Validates: Requirements 3.1**
   */
  describe('Property 4: Request-Response Matching', () => {
    it('should return matching entry for registered method and proxy-prefixed path', () => {
      fc.assert(
        fc.property(
          fc.array(harEntryArb, { minLength: 1, maxLength: 10 }),
          (entries) => {
            const map = buildEndpointMap(entries);
            
            // For each entry, verify we can find it by method and proxy-prefixed path
            for (const entry of entries) {
              const proxyPath = getProxyPath(entry.path);
              const found = findMatchingEntry(entry.method, proxyPath, map);
              
              // Should find an entry (might be different if duplicates exist)
              expect(found).not.toBeNull();
              
              // The found entry should have matching method and original path
              expect(found!.method).toBe(entry.method);
              expect(found!.path).toBe(entry.path);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


  /**
   * **Feature: har-proxy, Property 5: Unmatched Request Returns 404**
   * *For any* HTTP request to `/proxy/*` where the method and path combination does not exist
   * in the endpoint registry, the Mock_Server SHALL return a 404 status code.
   * **Validates: Requirements 3.2**
   */
  describe('Property 5: Unmatched Request Returns 404', () => {
    it('should return null for non-existent method/path combinations under /proxy', () => {
      fc.assert(
        fc.property(
          fc.array(harEntryArb, { minLength: 0, maxLength: 5 }),
          httpMethodArb,
          pathArb,
          (entries, queryMethod, queryPath) => {
            const map = buildEndpointMap(entries);
            
            // Query using proxy-prefixed path
            const proxyQueryPath = getProxyPath(queryPath);
            
            // Check if this method/path combination exists in entries (using original path)
            const exists = entries.some(
              (e) => e.method === queryMethod && e.path === queryPath
            );
            
            const found = findMatchingEntry(queryMethod, proxyQueryPath, map);
            
            if (exists) {
              // If it exists, we should find it at the proxy path
              expect(found).not.toBeNull();
            } else {
              // If it doesn't exist, we should get null (which triggers 404)
              expect(found).toBeNull();
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: har-proxy, Property 6: Latest Entry Wins**
   * *For any* sequence of entries with the same method and path, registering them
   * in order SHALL result in the last entry being returned for matching requests.
   * **Validates: Requirements 3.3**
   */
  describe('Property 6: Latest Entry Wins', () => {
    it('should return the last entry when duplicates exist', () => {
      fc.assert(
        fc.property(
          httpMethodArb,
          pathArb,
          fc.array(statusCodeArb, { minLength: 2, maxLength: 5 }),
          (method, path, statusCodes) => {
            // Create multiple entries with same method/path but different status codes
            const entries: HarEntry[] = statusCodes.map((status, index) => ({
              method,
              url: 'http://localhost',
              path,
              queryString: [],
              requestHeaders: [],
              status,
              responseHeaders: [],
              responseBody: `Response ${index}`,
              contentType: 'text/plain',
              timestamp: new Date(Date.now() + index * 1000).toISOString(),
            }));

            const map = buildEndpointMap(entries);
            // Query using proxy-prefixed path
            const proxyPath = getProxyPath(path);
            const found = findMatchingEntry(method, proxyPath, map);

            // Should return the last entry
            expect(found).not.toBeNull();
            expect(found!.status).toBe(statusCodes[statusCodes.length - 1]);
            expect(found!.responseBody).toBe(`Response ${statusCodes.length - 1}`);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: har-proxy, Property 7: Response Fidelity**
   * *For any* registered entry with headers and body content, the Mock_Server
   * response SHALL include all recorded headers and the exact body content
   * with correct content-type.
   * **Validates: Requirements 3.4, 3.5**
   */
  describe('Property 7: Response Fidelity', () => {
    it('should preserve all response data in the endpoint map', () => {
      fc.assert(
        fc.property(harEntryArb, (entry) => {
          const map = buildEndpointMap([entry]);
          // Query using proxy-prefixed path
          const proxyPath = getProxyPath(entry.path);
          const found = findMatchingEntry(entry.method, proxyPath, map);

          expect(found).not.toBeNull();
          
          // Verify response body is preserved exactly
          expect(found!.responseBody).toBe(entry.responseBody);
          
          // Verify content-type is preserved
          expect(found!.contentType).toBe(entry.contentType);
          
          // Verify status code is preserved
          expect(found!.status).toBe(entry.status);
          
          // Verify all response headers are preserved
          expect(found!.responseHeaders.length).toBe(entry.responseHeaders.length);
          for (let i = 0; i < entry.responseHeaders.length; i++) {
            expect(found!.responseHeaders[i].name).toBe(entry.responseHeaders[i].name);
            expect(found!.responseHeaders[i].value).toBe(entry.responseHeaders[i].value);
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: har-proxy, Property 10: Endpoint Count Accuracy**
   * *For any* set of loaded entries, the CLI SHALL display a count that exactly
   * matches the number of unique method+path combinations.
   * **Validates: Requirements 5.3**
   */
  describe('Property 10: Endpoint Count Accuracy', () => {
    it('should return accurate count of unique method+path combinations', () => {
      fc.assert(
        fc.property(
          fc.array(harEntryArb, { minLength: 0, maxLength: 20 }),
          (entries) => {
            const map = buildEndpointMap(entries);
            const count = getEndpointCount(map);

            // Calculate expected unique combinations
            const uniqueKeys = new Set(entries.map((e) => `${e.method}:${e.path}`));
            
            expect(count).toBe(uniqueKeys.size);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: har-proxy, Property 12: CORS Headers Included by Default**
   * *For any* HTTP request to the Mock_Server when CORS is enabled (default),
   * the response SHALL include Access-Control-Allow-Origin, Access-Control-Allow-Methods,
   * and Access-Control-Allow-Headers headers.
   * **Validates: Requirements 6.1**
   */
  describe('Property 12: CORS Headers Included by Default', () => {
    it('should add all CORS headers when applyCorsHeaders is called', () => {
      fc.assert(
        fc.property(
          fc.record({
            'Content-Type': fc.constantFrom('application/json', 'text/html', 'text/plain'),
          }),
          (initialHeaders) => {
            const headers: Record<string, string> = { ...initialHeaders };
            applyCorsHeaders(headers);
            
            // Verify all CORS headers are present
            expect(headers['Access-Control-Allow-Origin']).toBe(DEFAULT_CORS_HEADERS['Access-Control-Allow-Origin']);
            expect(headers['Access-Control-Allow-Methods']).toBe(DEFAULT_CORS_HEADERS['Access-Control-Allow-Methods']);
            expect(headers['Access-Control-Allow-Headers']).toBe(DEFAULT_CORS_HEADERS['Access-Control-Allow-Headers']);
            
            // Original headers should still be present
            expect(headers['Content-Type']).toBe(initialHeaders['Content-Type']);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include CORS headers in responses when cors is enabled', () => {
      fc.assert(
        fc.property(
          harEntryArb,
          (entry) => {
            const map = buildEndpointMap([entry]);
            
            // Track headers written to response
            let writtenHeaders: Record<string, string> = {};
            let writtenStatus = 0;
            
            const mockRes = {
              writeHead: (status: number, headers: Record<string, string>) => {
                writtenStatus = status;
                writtenHeaders = headers;
              },
              end: () => {},
            } as unknown as ServerResponse;
            
            const mockDashboard = () => {};
            
            // Create handler with CORS enabled (default)
            const handler = createRequestHandler(map, mockDashboard, true);
            
            // Simulate request to proxy path
            const proxyPath = getProxyPath(entry.path);
            const mockReq = {
              method: entry.method,
              url: proxyPath,
              headers: { host: 'localhost' },
            };
            
            handler(mockReq as any, mockRes);
            
            // Verify CORS headers are present
            expect(writtenHeaders['Access-Control-Allow-Origin']).toBe(DEFAULT_CORS_HEADERS['Access-Control-Allow-Origin']);
            expect(writtenHeaders['Access-Control-Allow-Methods']).toBe(DEFAULT_CORS_HEADERS['Access-Control-Allow-Methods']);
            expect(writtenHeaders['Access-Control-Allow-Headers']).toBe(DEFAULT_CORS_HEADERS['Access-Control-Allow-Headers']);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: har-proxy, Property 13: Preflight OPTIONS Request Handling**
   * *For any* OPTIONS request to a `/proxy/*` path when CORS is enabled,
   * the Mock_Server SHALL respond with a 204 status code and include all required CORS headers.
   * **Validates: Requirements 6.2**
   */
  describe('Property 13: Preflight OPTIONS Request Handling', () => {
    it('should respond with 204 and CORS headers for OPTIONS requests to /proxy/* paths', () => {
      fc.assert(
        fc.property(
          pathArb,
          (path) => {
            const map: EndpointMap = {};
            
            // Track response
            let writtenHeaders: Record<string, string> = {};
            let writtenStatus = 0;
            let responseEnded = false;
            
            const mockRes = {
              writeHead: (status: number, headers: Record<string, string>) => {
                writtenStatus = status;
                writtenHeaders = headers;
              },
              end: () => {
                responseEnded = true;
              },
            } as unknown as ServerResponse;
            
            const mockDashboard = () => {};
            
            // Create handler with CORS enabled
            const handler = createRequestHandler(map, mockDashboard, true);
            
            // Simulate OPTIONS request to proxy path
            const proxyPath = getProxyPath(path);
            const mockReq = {
              method: 'OPTIONS',
              url: proxyPath,
              headers: { host: 'localhost' },
            };
            
            handler(mockReq as any, mockRes);
            
            // Verify 204 status code
            expect(writtenStatus).toBe(204);
            
            // Verify CORS headers are present
            expect(writtenHeaders['Access-Control-Allow-Origin']).toBe(DEFAULT_CORS_HEADERS['Access-Control-Allow-Origin']);
            expect(writtenHeaders['Access-Control-Allow-Methods']).toBe(DEFAULT_CORS_HEADERS['Access-Control-Allow-Methods']);
            expect(writtenHeaders['Access-Control-Allow-Headers']).toBe(DEFAULT_CORS_HEADERS['Access-Control-Allow-Headers']);
            
            // Verify response was ended
            expect(responseEnded).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not handle OPTIONS requests when CORS is disabled', () => {
      fc.assert(
        fc.property(
          pathArb,
          (path) => {
            const map: EndpointMap = {};
            
            // Track response
            let writtenStatus = 0;
            
            const mockRes = {
              writeHead: (status: number) => {
                writtenStatus = status;
              },
              end: () => {},
            } as unknown as ServerResponse;
            
            const mockDashboard = () => {};
            
            // Create handler with CORS disabled
            const handler = createRequestHandler(map, mockDashboard, false);
            
            // Simulate OPTIONS request to proxy path
            const proxyPath = getProxyPath(path);
            const mockReq = {
              method: 'OPTIONS',
              url: proxyPath,
              headers: { host: 'localhost' },
            };
            
            handler(mockReq as any, mockRes);
            
            // Should return 404 (no matching entry) instead of 204 preflight response
            expect(writtenStatus).toBe(404);
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: har-proxy, Property 14: CORS Disabled Preserves Original Headers**
   * *For any* HAR entry containing CORS headers, when CORS is disabled via `--no-cors`,
   * the Mock_Server SHALL not inject automatic CORS headers but SHALL preserve
   * the original CORS headers from the HAR recording.
   * **Validates: Requirements 6.3, 6.4**
   */
  describe('Property 14: CORS Disabled Preserves Original Headers', () => {
    // Generator for HAR entries with CORS headers
    const corsHeaderArb = fc.constantFrom(
      { name: 'Access-Control-Allow-Origin', value: 'https://example.com' },
      { name: 'Access-Control-Allow-Methods', value: 'GET, POST' },
      { name: 'Access-Control-Allow-Headers', value: 'X-Custom-Header' },
      { name: 'Access-Control-Allow-Credentials', value: 'true' }
    );

    const harEntryWithCorsArb = fc.record({
      method: httpMethodArb,
      url: fc.constant('http://localhost'),
      path: pathArb,
      queryString: fc.constant([]),
      requestHeaders: fc.constant([]),
      status: statusCodeArb,
      responseHeaders: fc.array(corsHeaderArb, { minLength: 1, maxLength: 4 }),
      responseBody: fc.string({ maxLength: 200 }),
      contentType: mimeTypeArb,
      timestamp: fc.date().map((d) => d.toISOString()),
    });

    it('should preserve original HAR CORS headers when CORS is disabled', () => {
      fc.assert(
        fc.property(
          harEntryWithCorsArb,
          (entry) => {
            const map = buildEndpointMap([entry]);
            
            // Track headers written to response
            let writtenHeaders: Record<string, string> = {};
            
            const mockRes = {
              writeHead: (status: number, headers: Record<string, string>) => {
                writtenHeaders = headers;
              },
              end: () => {},
            } as unknown as ServerResponse;
            
            const mockDashboard = () => {};
            
            // Create handler with CORS disabled
            const handler = createRequestHandler(map, mockDashboard, false);
            
            // Simulate request to proxy path
            const proxyPath = getProxyPath(entry.path);
            const mockReq = {
              method: entry.method,
              url: proxyPath,
              headers: { host: 'localhost' },
            };
            
            handler(mockReq as any, mockRes);
            
            // Verify original HAR CORS headers are preserved
            for (const header of entry.responseHeaders) {
              expect(writtenHeaders[header.name]).toBe(header.value);
            }
            
            // Verify automatic CORS headers are NOT injected (unless they were in original HAR)
            const originalHasAllowOrigin = entry.responseHeaders.some(
              h => h.name === 'Access-Control-Allow-Origin'
            );
            if (!originalHasAllowOrigin) {
              expect(writtenHeaders['Access-Control-Allow-Origin']).toBeUndefined();
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not inject automatic CORS headers when CORS is disabled', () => {
      fc.assert(
        fc.property(
          harEntryArb.filter(e => 
            !e.responseHeaders.some(h => 
              h.name.toLowerCase().startsWith('access-control-')
            )
          ),
          (entry) => {
            const map = buildEndpointMap([entry]);
            
            // Track headers written to response
            let writtenHeaders: Record<string, string> = {};
            
            const mockRes = {
              writeHead: (status: number, headers: Record<string, string>) => {
                writtenHeaders = headers;
              },
              end: () => {},
            } as unknown as ServerResponse;
            
            const mockDashboard = () => {};
            
            // Create handler with CORS disabled
            const handler = createRequestHandler(map, mockDashboard, false);
            
            // Simulate request to proxy path
            const proxyPath = getProxyPath(entry.path);
            const mockReq = {
              method: entry.method,
              url: proxyPath,
              headers: { host: 'localhost' },
            };
            
            handler(mockReq as any, mockRes);
            
            // Verify NO automatic CORS headers are present
            expect(writtenHeaders['Access-Control-Allow-Origin']).toBeUndefined();
            expect(writtenHeaders['Access-Control-Allow-Methods']).toBeUndefined();
            expect(writtenHeaders['Access-Control-Allow-Headers']).toBeUndefined();
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
