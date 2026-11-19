import { connect } from "node:net";

// libpq names a socket directory either in ?host= or as a percent-encoded URL
// host ("postgres://u@%2Fvar%2Frun%2Fpostgresql/db"). node-postgres honors
// both, so the probe has to as well, or a socket-only setup never gets past it
// (#783). The socket file inside that directory is named after the port.
function probeTarget(url) {
  const host = url.searchParams.get("host") || decodeURIComponent(url.hostname);
  const port = Number(url.searchParams.get("port") || url.port || 5432);
  if (host.startsWith("/")) {
    const path = `${host.replace(/\/+$/, "")}/.s.PGSQL.${port}`;
    return { options: { path }, label: path };
  }
  return { options: { host, port }, label: `${host}:${port}` };
}

let target;
try {
  target = probeTarget(new URL(process.env.DATABASE_URL));
} catch {
  // node-postgres accepts forms WHATWG URL rejects, such as
  // "postgres://u:pw@/var/run/postgresql:5432/db". The app waits for the
  // database itself on boot, so step aside rather than fail a valid setup.
  console.error(
    "DATABASE_URL is not URL-shaped, so reachability is unchecked here; skipping the probe and letting the app wait for Postgres.",
  );
  process.exit(0);
}

const { options, label } = target;

const socket = connect(options, () => {
  socket.end();
  process.exit(0);
});

socket.on("error", (err) => {
  // Surface the actual reason instead of exiting silently, so the container
  // log distinguishes DNS failure (ENOTFOUND), refused connection
  // (ECONNREFUSED), and unreachable host instead of just looping on
  // "Waiting for Postgres...". This is a raw socket probe, so it cannot report
  // authentication or "database does not exist" errors; those surface later
  // when the app's Postgres driver connects.
  console.error(`Postgres not reachable at ${label}: ${err.code || err.message}`);
  process.exit(1);
});

setTimeout(() => {
  console.error(`Postgres connection to ${label} timed out after 3s`);
  process.exit(1);
}, 3000).unref();
