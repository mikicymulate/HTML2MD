#!/usr/bin/env node
/**
 * Stdio entry point for the html2md MCP server.
 *
 * Register with an AI coding agent, e.g.:
 *   claude mcp add html2md -- npx -y html2md-ai-mcp
 * or point the agent's MCP config at `node dist/mcp.js`.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp/server';

const server = createMcpServer();
const transport = new StdioServerTransport();

server.connect(transport).catch((err: unknown) => {
  // stdout carries the MCP protocol; diagnostics go to stderr only.
  process.stderr.write(`html2md-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
