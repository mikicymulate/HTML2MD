import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from '../src/mcp/server';
import type { ElementNode, ImageDesc } from '../src/types';

const here: string = dirname(fileURLToPath(import.meta.url));
const fixture: string = join(here, 'fixtures', 'article.html');

async function connectedClient(): Promise<Client> {
  const server = createMcpServer();
  const client = new Client({ name: 'mcp-test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function textOf(result: CallToolResult): string {
  const block = result.content?.find((c) => c.type === 'text');
  return block && block.type === 'text' ? block.text : '';
}

test.describe('MCP server (in-memory transport, real Chromium)', () => {
  test('lists the extraction and crawl tools', async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    const names: string[] = tools.map((t) => t.name).sort();
    expect(names).toEqual(['crawl_site', 'extract_elements', 'extract_images', 'extract_page']);
    await client.close();
  });

  test('extract_page returns clean Markdown for a local HTML file', async () => {
    test.setTimeout(120_000);
    const client = await connectedClient();
    const result = (await client.callTool({
      name: 'extract_page',
      arguments: { input: fixture },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    const markdown: string = textOf(result);
    expect(markdown).toContain('Widgets are small components');
    expect(markdown).not.toContain('Sponsored advertisement');
    expect(markdown).not.toContain('We use cookies');
    await client.close();
  });

  test('extract_elements returns a structured element map', async () => {
    test.setTimeout(120_000);
    const client = await connectedClient();
    const result = (await client.callTool({
      name: 'extract_elements',
      arguments: { input: fixture },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    const output = result.structuredContent as { elements: ElementNode[] };
    const email: ElementNode | undefined = output.elements.find(
      (e) => e.label === 'Email address',
    );
    expect(email?.kind).toBe('textfield');
    expect(email?.selector).toBeTruthy();
    await client.close();
  });

  test('extract_images describes meaningful images and drops trackers', async () => {
    test.setTimeout(120_000);
    const client = await connectedClient();
    const result = (await client.callTool({
      name: 'extract_images',
      arguments: { input: fixture },
    })) as CallToolResult;

    expect(result.isError).toBeFalsy();
    const output = result.structuredContent as { images: ImageDesc[] };
    const hero: ImageDesc | undefined = output.images.find(
      (i) => i.description === 'A red widget on a workbench',
    );
    expect(hero?.kept).toBe(true);
    const pixel: ImageDesc | undefined = output.images.find((i) => i.src.includes('pixel.gif'));
    expect(pixel?.kept).toBe(false);
    await client.close();
  });

  test('a failing extraction returns an isError result, not a protocol error', async () => {
    test.setTimeout(120_000);
    const client = await connectedClient();
    const result = (await client.callTool({
      name: 'extract_page',
      arguments: { input: 'http://127.0.0.1:1/unreachable', timeoutMs: 3000 },
    })) as CallToolResult;

    expect(result.isError).toBe(true);
    expect(textOf(result).length).toBeGreaterThan(0);
    await client.close();
  });
});
