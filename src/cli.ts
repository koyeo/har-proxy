#!/usr/bin/env node
/**
 * CLI Module
 * Handles command-line argument parsing and orchestrates the application
 */

import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ServerResponse } from 'node:http';
import { parseHarFile } from './parser.js';
import { createServer, startServer, buildEndpointMap, getEndpointCount } from './server.js';
import { generateDashboard } from './dashboard.js';

const VERSION = '1.0.0';

/**
 * Creates the CLI program with commander
 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('har-proxy')
    .description('A CLI tool that parses HAR files and creates a RESTful mock server')
    .version(VERSION)
    .argument('<har-file>', 'Path to the HAR file to load')
    .option('-p, --port <number>', 'Port to run the server on', '3000')
    .option('--no-cors', 'Disable automatic CORS header injection (preserves original HAR CORS headers)')
    .action(async (harFile: string, options: { port: string; cors: boolean }) => {
      await runServer(harFile, parseInt(options.port, 10), options.cors);
    });

  return program;
}

/**
 * Validates that the HAR file exists
 */
export function validateHarFile(filePath: string): { valid: boolean; resolvedPath: string; error?: string } {
  const resolvedPath = resolve(filePath);
  
  if (!existsSync(resolvedPath)) {
    return {
      valid: false,
      resolvedPath,
      error: `HAR file not found: ${resolvedPath}`,
    };
  }

  return { valid: true, resolvedPath };
}

/**
 * Creates a request logger for CLI output
 */
export function createLogger(): (method: string, path: string, status: number) => void {
  return (method: string, path: string, status: number) => {
    const timestamp = new Date().toISOString();
    const statusColor = status >= 400 ? '\x1b[31m' : status >= 300 ? '\x1b[33m' : '\x1b[32m';
    const reset = '\x1b[0m';
    console.log(`[${timestamp}] ${method} ${path} ${statusColor}${status}${reset}`);
  };
}

/**
 * Main function to run the server
 */
export async function runServer(harFilePath: string, port: number, cors: boolean = true): Promise<void> {
  // Validate HAR file
  const validation = validateHarFile(harFilePath);
  if (!validation.valid) {
    console.error(`Error: ${validation.error}`);
    process.exit(1);
  }

  // Parse HAR file
  console.log(`Loading HAR file: ${validation.resolvedPath}`);
  const result = await parseHarFile(validation.resolvedPath);

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`Parse error: ${error}`);
    }
    if (result.entries.length === 0) {
      process.exit(1);
    }
  }

  // Build endpoint map and get count
  const endpointMap = buildEndpointMap(result.entries);
  const endpointCount = getEndpointCount(endpointMap);

  // Create dashboard handler
  const dashboardHtml = generateDashboard(result.entries);
  const dashboardHandler = (res: ServerResponse) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(dashboardHtml);
  };

  // Create and start server
  const logger = createLogger();
  const server = createServer({ port, entries: result.entries, cors }, dashboardHandler, logger);

  try {
    await startServer(server, port);
    console.log(`\n🚀 HAR Proxy server running at http://localhost:${port}`);
    console.log(`📊 Dashboard available at http://localhost:${port}/`);
    console.log(`📦 Loaded ${endpointCount} endpoint${endpointCount !== 1 ? 's' : ''}`);
    console.log(`🌐 CORS: ${cors ? 'enabled (default)' : 'disabled'}`);
    console.log('\nPress Ctrl+C to stop the server\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error starting server: ${message}`);
    process.exit(1);
  }
}

// Run CLI when executed directly
const program = createProgram();
program.parse();
