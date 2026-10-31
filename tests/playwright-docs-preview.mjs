import http from "node:http";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

function parsePort(value) {
  const raw = String(value ?? "");
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Docs preview port must be an integer, received ${JSON.stringify(value)}`);
  }
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(
      `Docs preview port must be between 1024 and 65535, received ${JSON.stringify(value)}`,
    );
  }
  return port;
}

function validateOptions({ root = ".", host, port, strictPort }) {
  if (!strictPort) {
    throw new Error("Docs preview requires --strictPort");
  }
  if (typeof host !== "string" || !LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `Docs preview host must be "127.0.0.1" or "localhost", received ${JSON.stringify(host)}`,
    );
  }
  if (typeof root !== "string" || root.trim() === "") {
    throw new Error(`Docs preview root must be a non-empty path, received ${JSON.stringify(root)}`);
  }
  return {
    host,
    port: parsePort(port),
    root,
    strictPort: true,
  };
}

export function parseDocsPreviewArgs(argv) {
  let root = ".";
  let rootAssigned = false;
  let host;
  let port;
  let strictPort = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--strictPort") {
      strictPort = true;
    } else if (arg === "--host") {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        throw new Error("Docs preview --host requires a value");
      }
      host = next;
      i += 1;
    } else if (arg.startsWith("--host=")) {
      host = arg.slice("--host=".length);
    } else if (arg === "--port") {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        throw new Error("Docs preview --port requires a value");
      }
      port = next;
      i += 1;
    } else if (arg.startsWith("--port=")) {
      port = arg.slice("--port=".length);
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown docs preview flag: ${arg}`);
    } else if (!rootAssigned) {
      root = arg;
      rootAssigned = true;
    } else {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
  }

  return validateOptions({ root, host, port, strictPort });
}

function probeAddress(host, port, { allowUnavailable = false } = {}) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error) => {
      if (allowUnavailable && (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT")) {
        resolve(false);
        return;
      }
      reject(error);
    });
    probe.listen({ port, host, exclusive: true }, () => {
      probe.close((closeError) => {
        if (closeError) reject(closeError);
        else resolve(true);
      });
    });
  });
}

function listenExclusive(server, host, port) {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      server.off("error", onError);
      resolve(server);
    };
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    server.once("listening", onListening);
    server.once("error", onError);
    server.listen({ port, host, exclusive: true });
  });
}

function closeServerQuietly(server) {
  return new Promise((resolve) => {
    if (!server?.listening) {
      resolve(undefined);
      return;
    }
    server.closeAllConnections?.();
    server.close(() => resolve(undefined));
  });
}

async function loadVitePressServe() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const requireFromDocs = createRequire(path.join(repoRoot, "apps", "docs", "package.json"));
  const vitepressEntry = requireFromDocs.resolve("vitepress");
  const vitepress = await import(pathToFileURL(vitepressEntry).href);
  return vitepress.serve;
}

export async function startDocsPreviewServer(rawOptions) {
  const { root, host, port } = validateOptions(rawOptions);
  const resolvedRoot = path.resolve(process.cwd(), root);

  const ipv6Available = await probeAddress("::1", port, { allowUnavailable: true });
  await probeAddress("127.0.0.1", port);

  const serve = await loadVitePressServe();
  const origListen = net.Server.prototype.listen;
  let capturedServer = null;
  let resolveListen;
  let rejectListen;
  const listenPromise = new Promise((resolve, reject) => {
    resolveListen = resolve;
    rejectListen = reject;
  });

  net.Server.prototype.listen = function (firstArg, ...rest) {
    if (
      capturedServer === null &&
      typeof firstArg === "number" &&
      firstArg === port &&
      (rest.length === 0 || typeof rest[0] === "function")
    ) {
      capturedServer = this;
      net.Server.prototype.listen = origListen;
      const onListening = () => {
        this.off("error", onError);
        resolveListen(this);
      };
      const onError = (error) => {
        this.off("listening", onListening);
        rejectListen(error);
      };
      this.once("listening", onListening);
      this.once("error", onError);
      return origListen.call(this, { port, host: "127.0.0.1", exclusive: true }, ...rest);
    }
    return origListen.call(this, firstArg, ...rest);
  };

  let polkaApp;
  let primaryServer;
  try {
    polkaApp = await serve({ root: resolvedRoot, port });
    if (capturedServer === null) {
      await closeServerQuietly(polkaApp?.server);
      throw new Error("VitePress serve did not start an HTTP listener");
    }
    primaryServer = await listenPromise;
  } catch (error) {
    await closeServerQuietly(capturedServer ?? polkaApp?.server);
    throw error;
  } finally {
    net.Server.prototype.listen = origListen;
  }

  if (host === "localhost" && ipv6Available) {
    const ipv6Server = http.createServer((req, res) => {
      primaryServer.emit("request", req, res);
    });
    try {
      await listenExclusive(ipv6Server, "::1", port);
    } catch (error) {
      await closeServerQuietly(primaryServer);
      throw error;
    }

    const origClose = primaryServer.close.bind(primaryServer);
    const origCloseAll = primaryServer.closeAllConnections?.bind(primaryServer);
    primaryServer.closeAllConnections = () => {
      ipv6Server.closeAllConnections?.();
      origCloseAll?.();
    };
    primaryServer.close = (callback) => {
      ipv6Server.closeAllConnections?.();
      ipv6Server.close((ipv6Error) => {
        origClose((ipv4Error) => {
          callback?.(ipv4Error ?? ipv6Error);
        });
      });
      return primaryServer;
    };
  }

  return primaryServer;
}

async function main() {
  const options = parseDocsPreviewArgs(process.argv.slice(2));
  const server = await startDocsPreviewServer(options);

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.closeAllConnections?.();
    server.close((closeError) => {
      process.exit(closeError ? 1 : 0);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const isCli =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  main().catch((error) => {
    console.error("[docs-preview] failed to start server:", error);
    process.exit(1);
  });
}
