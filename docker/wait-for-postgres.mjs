import { connect } from "node:net";

const url = new URL(process.env.DATABASE_URL);
const socket = connect(Number(url.port || 5432), url.hostname, () => {
  socket.end();
  process.exit(0);
});
socket.on("error", () => process.exit(1));
setTimeout(() => process.exit(1), 3000).unref();
