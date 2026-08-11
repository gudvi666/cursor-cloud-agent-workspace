const form = document.getElementById("note-form");
const input = document.getElementById("note-input");
const list = document.getElementById("notes");
const empty = document.getElementById("empty");
const errorBox = document.getElementById("error");

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function render(notes) {
  list.replaceChildren();
  empty.hidden = notes.length > 0;

  for (const note of notes) {
    const li = document.createElement("li");
    li.className = "note";

    const span = document.createElement("span");
    span.className = "note__text";
    // textContent avoids any HTML injection from user-provided note text.
    span.textContent = note.text;

    const del = document.createElement("button");
    del.className = "note__delete";
    del.type = "button";
    del.setAttribute("aria-label", "Delete note");
    del.textContent = "\u00d7";
    del.addEventListener("click", () => deleteNote(note.id));

    li.append(span, del);
    list.append(li);
  }
}

async function loadNotes() {
  try {
    const res = await fetch("/api/notes");
    if (!res.ok) throw new Error("Failed to load notes.");
    const data = await res.json();
    render(data.notes);
  } catch (err) {
    showError(err.message);
  }
}

async function addNote(text) {
  clearError();
  try {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message ?? "Failed to add note.");
    }
    input.value = "";
    await loadNotes();
  } catch (err) {
    showError(err.message);
  }
}

async function deleteNote(id) {
  clearError();
  try {
    const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      throw new Error("Failed to delete note.");
    }
    await loadNotes();
  } catch (err) {
    showError(err.message);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (text.length === 0) return;
  addNote(text);
});

loadNotes();
