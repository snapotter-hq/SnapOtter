/**
 * A Redis connection can stop working without either end noticing.
 *
 * When the server comes back at a different address, a connection parked on a
 * blocking read has nothing left to send, so it never draws a reset and ioredis
 * never sees a disconnect. Connections that keep issuing commands heal
 * themselves; the consumers, the BullMQ QueueEvents streams and the pub/sub
 * subscribers, sat on dead sockets until the process was restarted. Jobs still
 * ran and still wrote correct output, so nothing else noticed: only the
 * completion signal was gone, which cost every synchronous request the full
 * sync-wait window and left attached progress streams on heartbeats forever
 * (PERF-20260726-007).
 *
 * The proxy below reproduces that shape faithfully. Freezing forwards nothing
 * in either direction and closes nothing, so both ends keep believing the
 * socket is fine, exactly like packets to an address whose owner has left. New
 * connections still work, which is what makes the failure so quiet.
 *
 * Recovery costs about one socket timeout, so this case is deliberately slow.
 */
import { randomUUID } from "node:crypto";
import { createServer, type Server, type Socket, connect as tcpConnect } from "node:net";
import { QueueEvents } from "bullmq";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { env } from "../../../apps/api/src/config.js";
import {
  createBullMQConnection,
  createRedisConnection,
  createRedisSubscriberConnection,
} from "../../../apps/api/src/jobs/connection.js";
import { bullPrefix, queueName } from "../../../apps/api/src/jobs/types.js";

/** The 30 s socket timeout plus the 10 s probe interval, plus a loaded box. */
const RECOVERY_BUDGET_MS = 75_000;
const CASE_TIMEOUT_MS = 150_000;

interface RelayPair {
  client: Socket;
  upstream: Socket;
  frozen: boolean;
}

/** A TCP relay that can stop forwarding without letting either end find out. */
class BlackholeProxy {
  private readonly pairs: RelayPair[] = [];
  private server: Server | null = null;

  async listen(upstream: URL): Promise<number> {
    const host = upstream.hostname;
    const port = Number(upstream.port || "6379");
    this.server = createServer((client) => {
      const forward = tcpConnect(port, host);
      const pair: RelayPair = { client, upstream: forward, frozen: false };
      this.pairs.push(pair);
      client.pipe(forward);
      forward.pipe(client);
      // A frozen pair must survive one end giving up on it: that is the whole
      // point of the fault, and tearing the other half down would be a signal.
      const drop = () => {
        if (pair.frozen) return;
        client.destroy();
        forward.destroy();
      };
      for (const socket of [client, forward]) {
        socket.on("error", drop);
        socket.on("close", drop);
      }
    });
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", resolve));
    const address = this.server?.address();
    if (!address || typeof address === "string") throw new Error("proxy did not bind a port");
    return address.port;
  }

  /** Stop relaying on every socket open right now. Later ones are unaffected. */
  freeze(): void {
    for (const pair of this.pairs) {
      if (pair.frozen) continue;
      pair.frozen = true;
      pair.client.unpipe(pair.upstream);
      pair.upstream.unpipe(pair.client);
      pair.client.pause();
      pair.upstream.pause();
    }
  }

  async close(): Promise<void> {
    for (const pair of this.pairs) {
      pair.client.destroy();
      pair.upstream.destroy();
    }
    this.pairs.length = 0;
    const server = this.server;
    this.server = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const proxy = new BlackholeProxy();
const originalRedisUrl = env.REDIS_URL;
const channel = `${bullPrefix()}:consumer-recovery-test`;
const eventsKey = `bull:${queueName("image")}:events`;
const probeEvent = "consumer-recovery-probe";

let subscriber: Redis | null = null;
let queueEvents: QueueEvents | null = null;
let publisher: Redis | null = null;

beforeAll(async () => {
  const port = await proxy.listen(new URL(originalRedisUrl));
  // Everything built while REDIS_URL points at the proxy dials through it; the
  // publisher is built afterwards so the far side of the break stays reachable.
  const proxied = new URL(originalRedisUrl);
  proxied.hostname = "127.0.0.1";
  proxied.port = String(port);
  env.REDIS_URL = proxied.toString().replace(/\/$/, "");

  subscriber = createRedisSubscriberConnection();
  await subscriber.subscribe(channel);
  queueEvents = new QueueEvents(queueName("image"), { connection: createBullMQConnection() });
  // BullMQ turns a consumer-loop failure into an 'error' event; the loop retries
  // on its own, and an unlistened one only clutters the run.
  queueEvents.on("error", () => {});
  await queueEvents.waitUntilReady();

  env.REDIS_URL = originalRedisUrl;
  publisher = createRedisConnection();
  await publisher.ping();
}, 60_000);

afterAll(async () => {
  env.REDIS_URL = originalRedisUrl;
  await queueEvents?.close().catch(() => {});
  subscriber?.disconnect();
  publisher?.disconnect();
  await proxy.close();
});

describe("Redis consumers whose socket wedges", () => {
  it(
    "still deliver queue events and pub/sub frames after the sockets go silent",
    async () => {
      const frames: string[] = [];
      const events: string[] = [];
      subscriber?.on("message", (_channel, message) => frames.push(message));
      (
        queueEvents as unknown as {
          on(event: string, listener: (args: { token?: string }) => void): void;
        }
      ).on(probeEvent, (args) => events.push(args.token ?? ""));

      // Baseline: both paths work through the proxy while it is relaying. The
      // stream event is not only a warm-up. A consumer that has never read one
      // is still parked on the literal "$", which the server resolves at
      // command time, so a resend after a reconnect would resume at the new
      // tail. Reading one first gives it a concrete position to resume from,
      // which is the state every pool is in once it has run a job.
      const baselineFrame = randomUUID();
      const baselineEvent = randomUUID();
      await publisher?.publish(channel, baselineFrame);
      await publisher?.xadd(eventsKey, "*", "event", probeEvent, "token", baselineEvent);
      await expect.poll(() => frames, { timeout: 10_000 }).toContain(baselineFrame);
      await expect.poll(() => events, { timeout: 10_000 }).toContain(baselineEvent);

      // The break. Nothing is closed and no reset is sent, so ioredis is told
      // nothing at all: without an inactivity timeout both consumers would wait
      // here for the life of the process.
      proxy.freeze();

      const eventToken = randomUUID();
      const frameToken = randomUUID();
      // The stream entry is written once. A consumer that reconnects resumes
      // from its last id, so the event has to survive the outage rather than
      // merely arrive after it. Pub/sub has no such memory, so that side is
      // republished until the subscriber is listening again.
      await publisher?.xadd(eventsKey, "*", "event", probeEvent, "token", eventToken);
      const republish = setInterval(() => {
        void publisher?.publish(channel, frameToken).catch(() => {});
      }, 1000);

      try {
        await expect
          .poll(() => events, { timeout: RECOVERY_BUDGET_MS, interval: 500 })
          .toContain(eventToken);
        // Receiving on the original channel also proves ioredis restored the
        // subscription rather than just the socket.
        await expect
          .poll(() => frames, { timeout: RECOVERY_BUDGET_MS, interval: 500 })
          .toContain(frameToken);
      } finally {
        clearInterval(republish);
      }
    },
    CASE_TIMEOUT_MS,
  );
});
