import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createServer } from "../src/server.js";
import { NotesStore, MAX_NOTE_LENGTH } from "../src/notesStore.js";

let server;
let store;
let baseUrl;

before(async () => {
  store = new NotesStore();
  server = createServer(store);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => {
  server.close();
});

beforeEach(() => {
  store.clear();
});

async function api(path, options) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const text = await res.text();
  const body = text.length ? JSON.parse(text) : null;
  return { status: res.status, body };
}

test("health endpoint reports ok", async () => {
  const res = await api("/api/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "ok" });
});

test("notes start empty", async () => {
  const res = await api("/api/notes");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.notes, []);
});

test("create then list a note (end-to-end)", async () => {
  const created = await api("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "  buy milk  " }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.note.text, "buy milk");
  assert.ok(created.body.note.id);

  const list = await api("/api/notes");
  assert.equal(list.body.notes.length, 1);
  assert.equal(list.body.notes[0].text, "buy milk");
});

test("delete a note", async () => {
  const created = await api("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "temporary" }),
  });
  const { id } = created.body.note;

  const del = await api(`/api/notes/${id}`, { method: "DELETE" });
  assert.equal(del.status, 204);

  const list = await api("/api/notes");
  assert.equal(list.body.notes.length, 0);
});

test("deleting a missing note returns 404", async () => {
  const del = await api("/api/notes/does-not-exist", { method: "DELETE" });
  assert.equal(del.status, 404);
  assert.equal(del.body.error.code, "not_found");
});

test("rejects empty note text", async () => {
  const res = await api("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "   " }),
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "invalid_request");
});

test("rejects non-string note text", async () => {
  const res = await api("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: 42 }),
  });
  assert.equal(res.status, 400);
});

test("rejects note text over the max length", async () => {
  const res = await api("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "x".repeat(MAX_NOTE_LENGTH + 1) }),
  });
  assert.equal(res.status, 400);
});

test("rejects invalid JSON body", async () => {
  const res = await api("/api/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  });
  assert.equal(res.status, 400);
});

test("blocks path traversal on static routes", async () => {
  const res = await fetch(`${baseUrl}/../package.json`);
  assert.ok([403, 404].includes(res.status));
});

test("serves the index page", async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<title>Notes/);
});
