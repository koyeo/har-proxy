/**
 * Integration tests for end-to-end flow
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, startServer, buildEndpointMap } from '../src/server.js';
import { parseHarFile } from '../src/parser.js';
import { generateDashboard } from '../src/dashboard.js';
import type { Server } from 'node:http';
import type { ServerResponse } from 'node:http';
import { resolve } from 'node:path';

describe('Integration Tests', () => {
  const harFilePath = resolve(__dirname, 'fixtures/sample.har');
  let server: Server;
  let port: number;

  beforeAll(async () => {
    // Parse HAR file
    const result = await parseHarFile(harFilePath);
    expect(result.errors).toHaveLength(0);
    expect(result.entries.length).toBeGreaterThan(0);

    // Create dashboard handler
    const dashboardHtml = generateDashboard(result.entries);
    const dashboardHandler = (res: ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(dashboardHtml);
    };

    // Create and start server on random port
    port = 3100 + Math.floor(Math.random() * 100);
    server = createServer({ port, entries: result.entries }, dashboardHandler);
    await startServer(server, port);
  });

  afterAll(() => {
    server?.close();
  });

  describe('HAR file parsing', () => {
    it('should parse sample HAR file correctly', async () => {
      const result = await parseHarFile(harFilePath);
      
      expect(result.entries).toHaveLength(3);
      expect(result.errors).toHaveLength(0);

      // Verify first entry
      const firstEntry = result.entries[0];
      expect(firstEntry.method).toBe('GET');
      expect(firstEntry.path).toBe('/users');
      expect(firstEntry.status).toBe(200);
      expect(firstEntry.contentType).toBe('application/json');
    });
  });

  describe('Server responses', () => {
    it('should return correct response for GET /proxy/users', async () => {
      const response = await fetch(`http://localhost:${port}/proxy/users`);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');
      
      const body = await response.text();
      expect(body).toBe('[{"id":1,"name":"John"}]');
    });

    it('should return correct response for POST /proxy/users', async () => {
      const response = await fetch(`http://localhost:${port}/proxy/users`, {
        method: 'POST',
      });
      
      expect(response.status).toBe(201);
      
      const body = await response.text();
      expect(body).toBe('{"id":2,"name":"Jane"}');
    });

    it('should return 404 for non-existent endpoint under /proxy', async () => {
      const response = await fetch(`http://localhost:${port}/proxy/nonexistent`);
      
      expect(response.status).toBe(404);
    });

    it('should return 404 for paths not under /proxy', async () => {
      const response = await fetch(`http://localhost:${port}/users`);
      
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.message).toContain('/proxy');
    });
  });

  describe('Dashboard', () => {
    it('should serve dashboard at root path with proxy-prefixed paths', async () => {
      const response = await fetch(`http://localhost:${port}/`);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      
      const html = await response.text();
      expect(html).toContain('HAR Proxy Dashboard');
      expect(html).toContain('/proxy/users');
      expect(html).toContain('/proxy/products/123');
      expect(html).toContain('GET');
      expect(html).toContain('POST');
    });
  });

  describe('Endpoint grouping', () => {
    it('should group endpoints by base path in dashboard with proxy prefix', async () => {
      const result = await parseHarFile(harFilePath);
      const html = generateDashboard(result.entries);
      
      // Should have groups for /proxy/users and /proxy/products
      expect(html).toContain('/proxy/users');
      expect(html).toContain('/proxy/products');
    });
  });
});
