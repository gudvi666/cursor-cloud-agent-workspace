import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";

import { NotesStore, validateNoteText, ValidationError } from "./notesStore.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

// Cap request bodies so a hostile client cannot exhaust memory.
const MAX_BODY_BYTES = 16 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
};

/**
 * Build the HTTP server. Accepts a NotesStore so tests can inject their own
 * isolated state.
 */
export function createServer(store = new NotesStore()) {
  return createHttpServer((req, res) => {
    handleRequest(req, res, store).catch((err) => {
      // Last-resort boundary: never leak internals to the client.
      console.error("Unhandled request error:", err);
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: { code: "internal_error", message: "Internal server error." },
        });
      } else {
        res.end();
      }
    });
  });
}

async function handleRequest(req, res, store) {
  applySecurityHeaders(res);

  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;

  if (path === "/api/health" && req.method === "GET") {
    return sendJson(res, 200, { status: "ok" });
  }

  if (path === "/api/notes" && req.method === "GET") {
    return sendJson(res, 200, { notes: store.list() });
  }

  if (path === "/api/notes" && req.method === "POST") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      return sendError(res, err);
    }
    try {
      const text = validateNoteText(body?.text);
      const note = store.create(text);
      return sendJson(res, 201, { note });
    } catch (err) {
      return sendError(res, err);
    }
  }

  const deleteMatch = path.match(/^\/api\/notes\/([^/]+)$/);
  if (deleteMatch && req.method === "DELETE") {
    const removed = store.delete(decodeURIComponent(deleteMatch[1]));
    if (!removed) {
      return sendJson(res, 404, {
        error: { code: "not_found", message: "Note not found." },
      });
    }
    res.writeHead(204);
    return res.end();
  }

  if (path.startsWith("/api/")) {
    return sendJson(res, 404, {
      error: { code: "not_found", message: "Unknown API route." },
    });
  }

  return serveStatic(req, res, path);
}

function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'",
  );
}

async function serveStatic(req, res, path) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, {
      error: { code: "method_not_allowed", message: "Method not allowed." },
    });
  }

  const relative = path === "/" ? "index.html" : path.replace(/^\/+/, "");
  // Resolve within PUBLIC_DIR and reject any path traversal attempts.
  const resolved = normalize(join(PUBLIC_DIR, relative));
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + "/")) {
    return sendJson(res, 403, {
      error: { code: "forbidden", message: "Forbidden." },
    });
  }

  try {
    const content = await readFile(resolved);
    const type = MIME_TYPES[extname(resolved)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch {
    sendJson(res, 404, {
      error: { code: "not_found", message: "Not found." },
    });
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new ValidationError("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new ValidationError("Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function sendError(res, err) {
  if (err instanceof ValidationError) {
    return sendJson(res, 400, {
      error: { code: "invalid_request", message: err.message },
    });
  }
  throw err;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}
