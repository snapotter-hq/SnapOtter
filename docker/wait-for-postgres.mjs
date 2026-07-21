import { connect } from "node:net";

const url = new URL(process.env.DATABASE_URL);
const host = url.hostname;
const port = Number(url.port || 5432);

const socket = connect(port, host, () => {
  socket.end();
  process.exit(0);
});

socket.on("error", (err) => {
  // Surface the actual reason instead of exiting silently, so the container
  // log distinguishes DNS failure (ENOTFOUND), refused connection
  // (ECONNREFUSED), and unreachable host instead of just looping on
  // "Waiting for Postgres...". This is a raw TCP probe, so it cannot report
  // authentication or "database does not exist" errors; those surface later
  // when the app's Postgres driver connects.
  console.error(`Postgres not reachable at ${host}:${port}: ${err.code || err.message}`);
  process.exit(1);
});

setTimeout(() => {
  console.error(`Postgres connection to ${host}:${port} timed out after 3s`);
  process.exit(1);
}, 3000).unref();
