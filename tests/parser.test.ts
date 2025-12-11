/**
 * Property-based tests for HAR Parser module
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  transformEntry,
  decodeBase64,
  encodeBase64,
  formatEntry,
  parseFormattedEntry,
} from '../src/parser.js';
import type { HarLogEntry, HarEntry } from '../src/types/index.js';

// Generators for HAR structures
const headerArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  value: fc.string({ maxLength: 200 }),
});

const queryParamArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  value: fc.string({ maxLength: 200 }),
});

const httpMethodArb = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS');

const urlArb = fc.tuple(
  fc.constantFrom('http', 'https'),
  fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /^[a-zA-Z0-9.-]+$/.test(s)),
  fc.string({ maxLength: 50 }).map((s) => '/' + s.replace(/[^a-zA-Z0-9/._-]/g, ''))
).map(([protocol, host, path]) => `${protocol}://${host}${path}`);

const statusCodeArb = fc.integer({ min: 100, max: 599 });

const mimeTypeArb = fc.constantFrom(
  'application/json',
  'text/html',
  'text/plain',
  'application/xml',
  'application/octet-stream'
);

const harLogEntryArb: fc.Arbitrary<HarLogEntry> = fc.record({
  startedDateTime: fc.date().map((d) => d.toISOString()),
  request: fc.record({
    method: httpMethodArb,
    url: urlArb,
    headers: fc.array(headerArb, { maxLength: 10 }),
    queryString: fc.array(queryParamArb, { maxLength: 5 }),
  }),
  response: fc.record({
    status: statusCodeArb,
    headers: fc.array(headerArb, { maxLength: 10 }),
    content: fc.record({
      size: fc.integer({ min: 0, max: 10000 }),
      mimeType: mimeTypeArb,
      text: fc.option(fc.string({ maxLength: 500 }), { nil: undefined }),
      encoding: fc.option(fc.constant('base64'), { nil: undefined }),
    }),
  }),
});

// Generator for valid HarEntry (with constraints for round-trip compatibility)
const harEntryArb: fc.Arbitrary<HarEntry> = fc.record({
  method: httpMethodArb,
  url: urlArb,
  path: fc.string({ minLength: 1, maxLength: 50 }).map((s) => '/' + s.replace(/[^a-zA-Z0-9/._-]/g, '').replace(/\s+/g, '')),
  queryString: fc.array(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('=') && !s.includes('\n') && s.trim() === s),
      value: fc.string({ maxLength: 50 }).filter((s) => !s.includes('\n')),
    }),
    { maxLength: 3 }
  ),
  requestHeaders: fc.array(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes(':') && !s.includes('\n') && s.trim() === s),
      value: fc.string({ maxLength: 100 }).filter((s) => !s.includes('\n')),
    }),
    { maxLength: 3 }
  ),
  status: statusCodeArb,
  responseHeaders: fc.array(
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => !s.includes(':') && !s.includes('\n') && s.trim() === s),
      value: fc.string({ maxLength: 100 }).filter((s) => !s.includes('\n')),
    }),
    { maxLength: 3 }
  ),
  responseBody: fc.string({ maxLength: 150 }).filter((s) => !s.includes('\n')),
  contentType: mimeTypeArb,
  timestamp: fc.date().map((d) => d.toISOString()),
});

describe('HAR Parser', () => {
  /**
   * **Feature: har-proxy, Property 1: HAR Parsing Completeness**
   * *For any* valid HAR file containing entries, the HAR_Parser SHALL extract
   * all request data (method, URL, headers, query parameters) and all response
   * data (status code, headers, body content) for every entry.
   * **Validates: Requirements 2.1, 2.2**
   */
  describe('Property 1: HAR Parsing Completeness', () => {
    it('should extract all request and response data from HAR entries', () => {
      fc.assert(
        fc.property(harLogEntryArb, (logEntry) => {
          const entry = transformEntry(logEntry);

          // Verify request data extraction
          expect(entry.method).toBe(logEntry.request.method.toUpperCase());
          expect(entry.url).toBe(logEntry.request.url);
          expect(entry.path).toBeTruthy();
          expect(entry.queryString.length).toBe(logEntry.request.queryString.length);
          expect(entry.requestHeaders.length).toBe(logEntry.request.headers.length);

          // Verify response data extraction
          expect(entry.status).toBe(logEntry.response.status);
          expect(entry.responseHeaders.length).toBe(logEntry.response.headers.length);
          expect(entry.timestamp).toBe(logEntry.startedDateTime);

          // Verify all query params are preserved
          for (let i = 0; i < logEntry.request.queryString.length; i++) {
            expect(entry.queryString[i].name).toBe(logEntry.request.queryString[i].name);
            expect(entry.queryString[i].value).toBe(logEntry.request.queryString[i].value);
          }

          // Verify all request headers are preserved
          for (let i = 0; i < logEntry.request.headers.length; i++) {
            expect(entry.requestHeaders[i].name).toBe(logEntry.request.headers[i].name);
            expect(entry.requestHeaders[i].value).toBe(logEntry.request.headers[i].value);
          }

          // Verify all response headers are preserved
          for (let i = 0; i < logEntry.response.headers.length; i++) {
            expect(entry.responseHeaders[i].name).toBe(logEntry.response.headers[i].name);
            expect(entry.responseHeaders[i].value).toBe(logEntry.response.headers[i].value);
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: har-proxy, Property 2: Base64 Decoding Round-Trip**
   * *For any* string content, encoding it to base64 and then decoding it
   * through the HAR_Parser SHALL produce the original string content.
   * **Validates: Requirements 2.3**
   */
  describe('Property 2: Base64 Decoding Round-Trip', () => {
    it('should preserve content through encode/decode cycle', () => {
      fc.assert(
        fc.property(fc.string(), (original) => {
          const encoded = encodeBase64(original);
          const decoded = decodeBase64(encoded);
          expect(decoded).toBe(original);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly decode base64 content in HAR entries', () => {
      fc.assert(
        fc.property(
          fc.string({ maxLength: 500 }),
          httpMethodArb,
          urlArb,
          statusCodeArb,
          (bodyContent, method, url, status) => {
            const base64Content = encodeBase64(bodyContent);

            const logEntry: HarLogEntry = {
              startedDateTime: new Date().toISOString(),
              request: {
                method,
                url,
                headers: [],
                queryString: [],
              },
              response: {
                status,
                headers: [],
                content: {
                  size: bodyContent.length,
                  mimeType: 'text/plain',
                  text: base64Content,
                  encoding: 'base64',
                },
              },
            };

            const entry = transformEntry(logEntry);
            expect(entry.responseBody).toBe(bodyContent);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: har-proxy, Property 3: Entry Text Representation Round-Trip**
   * *For any* valid HarEntry, generating its text representation and parsing
   * it back SHALL produce an equivalent entry structure.
   * **Validates: Requirements 2.5**
   */
  describe('Property 3: Entry Text Representation Round-Trip', () => {
    it('should preserve entry data through format/parse cycle', () => {
      fc.assert(
        fc.property(harEntryArb, (entry) => {
          const formatted = formatEntry(entry);
          const parsed = parseFormattedEntry(formatted);

          // Core fields should match
          expect(parsed.method).toBe(entry.method);
          expect(parsed.path).toBe(entry.path);
          expect(parsed.status).toBe(entry.status);
          expect(parsed.contentType).toBe(entry.contentType);
          expect(parsed.timestamp).toBe(entry.timestamp);

          // Headers should match
          expect(parsed.requestHeaders.length).toBe(entry.requestHeaders.length);
          expect(parsed.responseHeaders.length).toBe(entry.responseHeaders.length);

          for (let i = 0; i < entry.requestHeaders.length; i++) {
            expect(parsed.requestHeaders[i].name).toBe(entry.requestHeaders[i].name);
            expect(parsed.requestHeaders[i].value).toBe(entry.requestHeaders[i].value);
          }

          for (let i = 0; i < entry.responseHeaders.length; i++) {
            expect(parsed.responseHeaders[i].name).toBe(entry.responseHeaders[i].name);
            expect(parsed.responseHeaders[i].value).toBe(entry.responseHeaders[i].value);
          }

          // Query params should match
          expect(parsed.queryString.length).toBe(entry.queryString.length);
          for (let i = 0; i < entry.queryString.length; i++) {
            expect(parsed.queryString[i].name).toBe(entry.queryString[i].name);
            expect(parsed.queryString[i].value).toBe(entry.queryString[i].value);
          }

          // Body should match (accounting for truncation)
          if (entry.responseBody.length <= 200) {
            expect(parsed.responseBody).toBe(entry.responseBody);
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});
