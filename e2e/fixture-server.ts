import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ORIGIN, type FakeSite } from '../test/fixtures/site';

export interface FixtureServer {
  origin: string;
  close: () => Promise<void>;
}

/** Serves a unit-test fixture site on 127.0.0.1, with the fixture origin rewritten to the real one. */
export async function serveFixture(site: FakeSite): Promise<FixtureServer> {
  let origin = '';
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const page = site[path];
    if (!page) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(page.status ?? 200, page.headers ?? {}).end(page.body.replaceAll(ORIGIN, origin));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { origin, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
