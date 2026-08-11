# cursor-cloud-agent-workspace

Minimal public workspace for Cursor Cloud Agents.

It ships a tiny full-stack **Notes** demo app used to exercise the Cloud Agent
development environment end to end. The app is deliberately dependency-free: it
uses only the Node.js standard library, so there is nothing to install beyond
Node itself.

## Requirements

- Node.js >= 20 (the environment uses Node 22)

## Getting started

```bash
npm ci        # install (no runtime deps; validates the lockfile)
npm start     # start the server on http://localhost:3000
npm run dev   # start with auto-reload (node --watch)
npm test      # run the test suite (node --test)
```

Then open http://localhost:3000 and add a note.

## Project layout

```
public/            Static frontend (HTML/CSS/JS, no build step)
src/index.js       Server entrypoint (reads PORT / HOST)
src/server.js      HTTP server, routing, static file serving
src/notesStore.js  In-memory notes store + input validation
test/notes.test.js API + validation tests
```

## API

| Method | Path              | Description                        |
| ------ | ----------------- | ---------------------------------- |
| GET    | `/api/health`     | Health check (`{ "status": "ok" }`)|
| GET    | `/api/notes`      | List notes (newest first)          |
| POST   | `/api/notes`      | Create a note (`{ "text": "…" }`)  |
| DELETE | `/api/notes/:id`  | Delete a note by id                |

Notes are stored in memory and reset when the server restarts.

## Cloud Agent environment

`.cursor/environment.json` runs `npm ci` on setup and launches `npm start` in a
persistent `server` terminal, exposing port `3000`.
