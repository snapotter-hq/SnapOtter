import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface RequestRecorder {
  /** Origin to embed in a fixture, e.g. http://127.0.0.1:54321 */
  origin: string;
  /** Paths of every request that arrived, in order. */
  requests: string[];
  /** Sockets opened, which catches a connect the request never completed. */
  connections: () => number;
  /** Prove the listener is reachable, then clear what the probe recorded. */
  probe: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * A listener the code under test genuinely could reach, used to prove it did
 * not. Pointing a fixture at a closed port only shows the fetch failed, which
 * a missing SSRF guard also produces; a live server distinguishes "refused"
 * from "never attempted". Always call probe() before asserting on an empty
 * log, or an unreachable listener reads as a pass.
 */
export async function startRequestRecorder(): Promise<RequestRecorder> {
  const requests: string[] = [];
  let connections = 0;
  const server = createServer((req, res) => {
    requests.push(req.url ?? "");
    res.writeHead(200, { "content-type": "image/png" });
    res.end(Buffer.from("89504e470d0a1a0a", "hex"));
  });
  server.on("connection", () => {
    connections += 1;
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    requests,
    connections: () => connections,
    probe: async () => {
      const res = await fetch(`${origin}/probe`);
      await res.arrayBuffer();
      if (requests.at(-1) !== "/probe") {
        throw new Error(`request recorder at ${origin} did not record its own probe`);
      }
      requests.length = 0;
      connections = 0;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
