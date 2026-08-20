import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = 8787;
const TOKEN = process.env.HOOK_SINK_TOKEN;
const OUT_FILE = path.resolve("cursor-events.jsonl");

if (!TOKEN) {
  console.error("HOOK_SINK_TOKEN is required");
  process.exit(1);
}

function send(res, status, body = "") {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = req.url || "";

  if (req.method !== "POST" || (url !== "/pre" && url !== "/post")) {
    send(res, 404, "{\"error\":\"not_found\"}");
    return;
  }

  const auth = req.headers.authorization || "";
  if (auth !== `Bearer ${TOKEN}`) {
    send(res, 401, "{\"error\":\"unauthorized\"}");
    return;
  }

  const chunks = [];
  req.on("data", (chunk) => {
    chunks.push(chunk);
  });

  req.on("error", () => {
    send(res, 400, "{\"error\":\"request_error\"}");
  });

  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = { _unparsed: raw };
    }

    const record = {
      time: new Date().toISOString(),
      path: url,
      body,
    };

    const pretty = JSON.stringify(record, null, 2);
    console.log(pretty);
    fs.appendFileSync(OUT_FILE, `${JSON.stringify(record)}\n`);
    send(res, 200, "{}");
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.error(`hook sink listening on http://0.0.0.0:${PORT}`);
  console.error(`writing events to ${OUT_FILE}`);
});
