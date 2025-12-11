/**
 * Property-based tests for Dashboard module
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  groupEndpoints,
  getBasePath,
  generateDashboard,
  toEndpointInfo,
} from '../src/dashboard.js';
import { PROXY_PREFIX } from '../src/server.js';
import type { HarEntry } from '../src/types/index.js';

// Generators for dashboard tests
const httpMethodArb = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS');

const pathSegmentArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter((s) => /^[a-zA-Z0-9._-]+$/.test(s));

const pathArb = fc.array(pathSegmentArb, { minLength: 1, maxLength: 4 })
  .map((segments) => '/' + segments.join('/'));

const statusCodeArb = fc.integer({ min: 100, max: 599 });

const mimeTypeArb = fc.constantFrom(
  'application/json',
  'text/html',
  'text/plain',
  'application/xml'
);

const harEntryArb: fc.Arbitrary<HarEntry> = fc.record({
  method: httpMethodArb,
  url: fc.constant('http://localhost'),
  path: pathArb,
  queryString: fc.constant([]),
  requestHeaders: fc.constant([]),
  status: statusCodeArb,
  responseHeaders: fc.constant([]),
  responseBody: fc.string({ maxLength: 100 }),
  contentType: mimeTypeArb,
  timestamp: fc.date().map((d) => d.toISOString()),
});

describe('Dashboard', () => {
  /**
   * **Feature: har-proxy, Property 9: Dashboard Groups by Base Path**
   * *For any* set of entries, endpoints sharing the same base path (first path
   * segment after /proxy) SHALL be grouped together in the dashboard output.
   * **Validates: Requirements 4.5**
   */
  describe('Property 9: Dashboard Groups by Base Path', () => {
    it('should group endpoints by their base path (including /proxy prefix)', () => {
      fc.assert(
        fc.property(
          fc.array(harEntryArb, { minLength: 1, maxLength: 10 }),
          (entries) => {
            const groups = groupEndpoints(entries);

            // Verify each entry appears in the correct group
            for (const entry of entries) {
              // toEndpointInfo adds the /proxy prefix
              const endpointInfo = toEndpointInfo(entry);
              const expectedBasePath = getBasePath(endpointInfo.path);
              const group = groups.find((g) => g.basePath === expectedBasePath);

              expect(group).toBeDefined();
              
              // Verify the entry is in this group (path now includes /proxy prefix)
              const found = group!.endpoints.some(
                (ep) => ep.path === endpointInfo.path && ep.method === entry.method
              );
              expect(found).toBe(true);
            }

            // Verify all endpoints in each group share the same base path
            for (const group of groups) {
              for (const endpoint of group.endpoints) {
                expect(getBasePath(endpoint.path)).toBe(group.basePath);
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sort groups alphabetically by base path', () => {
      fc.assert(
        fc.property(
          fc.array(harEntryArb, { minLength: 2, maxLength: 10 }),
          (entries) => {
            const groups = groupEndpoints(entries);

            // Verify groups are sorted
            for (let i = 1; i < groups.length; i++) {
              expect(groups[i - 1].basePath.localeCompare(groups[i].basePath)).toBeLessThanOrEqual(0);
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
   * **Feature: har-proxy, Property 8: Dashboard Displays Complete Endpoint Info**
   * *For any* set of registered entries, the generated dashboard HTML SHALL
   * contain the method, proxy-prefixed path, status code, and content-type for every entry.
   * **Validates: Requirements 4.2, 4.3, 4.4**
   */
  describe('Property 8: Dashboard Displays Complete Endpoint Info', () => {
    it('should include method, proxy-prefixed path, status, and content-type for all entries', () => {
      fc.assert(
        fc.property(
          fc.array(harEntryArb, { minLength: 1, maxLength: 10 }),
          (entries) => {
            const html = generateDashboard(entries);

            for (const entry of entries) {
              // Verify method is present
              expect(html).toContain(entry.method);
              
              // Verify proxy-prefixed path is present (escaped for HTML)
              const proxyPath = PROXY_PREFIX + entry.path;
              expect(html).toContain(proxyPath);
              
              // Verify status code is present
              expect(html).toContain(String(entry.status));
              
              // Verify content-type is present
              expect(html).toContain(entry.contentType);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should display correct endpoint count', () => {
      fc.assert(
        fc.property(
          fc.array(harEntryArb, { minLength: 0, maxLength: 10 }),
          (entries) => {
            const html = generateDashboard(entries);
            
            // The dashboard should show the count
            expect(html).toContain(`${entries.length} endpoint`);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
