import { createServer } from "./server.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const server = createServer();

server.listen(PORT, HOST, () => {
  console.log(`Notes app listening on http://${HOST}:${PORT}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down.`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
