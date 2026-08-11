import { randomUUID } from "node:crypto";

export const MAX_NOTE_LENGTH = 280;

/**
 * In-memory notes store. State is intentionally ephemeral: this is a demo app
 * for exercising the Cloud Agent development environment end to end, not a
 * production datastore.
 */
export class NotesStore {
  #notes = new Map();

  list() {
    return [...this.#notes.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  create(text) {
    const note = {
      id: randomUUID(),
      text,
      createdAt: Date.now(),
    };
    this.#notes.set(note.id, note);
    return note;
  }

  delete(id) {
    return this.#notes.delete(id);
  }

  clear() {
    this.#notes.clear();
  }
}

/**
 * Validate untrusted note text coming from a client request body.
 * Returns a normalized string on success, or throws a ValidationError.
 */
export function validateNoteText(value) {
  if (typeof value !== "string") {
    throw new ValidationError("Field 'text' must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError("Field 'text' must not be empty.");
  }
  if (trimmed.length > MAX_NOTE_LENGTH) {
    throw new ValidationError(
      `Field 'text' must be at most ${MAX_NOTE_LENGTH} characters.`,
    );
  }
  return trimmed;
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}
