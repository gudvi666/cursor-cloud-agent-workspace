#!/usr/bin/env bash
# Capture raw subagentStop payload and, when possible, the transcript file.
# stdout must remain only `{}`. Network/read failures must not fail the hook.

tmp_in="$(mktemp)"
tmp_out="$(mktemp)"
cleanup() {
  rm -f "$tmp_in" "$tmp_out"
}
trap cleanup EXIT

cat > "$tmp_in"

build_payload() {
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$tmp_in" "$tmp_out" <<'PY'
import json
import os
import sys

in_path, out_path = sys.argv[1], sys.argv[2]
event = {}
parse_error = None

try:
    with open(in_path, "rb") as fh:
        raw = fh.read()
    parsed = json.loads(raw.decode("utf-8"))
    if isinstance(parsed, dict):
        event = parsed
    else:
        event = {"_non_object": parsed}
except Exception as exc:
    parse_error = "payload_parse: %s" % exc
    event = {}

path = ""
if isinstance(event, dict):
    value = event.get("agent_transcript_path")
    if value is not None:
        path = str(value)

def write(payload):
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

if parse_error is not None:
    write({
        "event": {},
        "transcript_path": path,
        "transcript_exists": False,
        "transcript": "",
        "read_error": parse_error,
    })
    raise SystemExit(0)

if path.strip() == "":
    write({
        "event": event,
        "transcript_path": path,
        "transcript_exists": False,
        "transcript": "",
        "read_error": "agent_transcript_path missing or empty",
    })
    raise SystemExit(0)

exists = os.path.isfile(path)
if not exists:
    write({
        "event": event,
        "transcript_path": path,
        "transcript_exists": False,
        "transcript": "",
        "read_error": "file does not exist",
    })
    raise SystemExit(0)

try:
    if not os.access(path, os.R_OK):
        raise PermissionError("not readable")
    with open(path, "rb") as fh:
        data = fh.read()
    write({
        "event": event,
        "transcript_path": path,
        "transcript_exists": True,
        "transcript": data.decode("utf-8"),
    })
except Exception as exc:
    write({
        "event": event,
        "transcript_path": path,
        "transcript_exists": exists,
        "transcript": "",
        "read_error": str(exc),
    })
PY
    return $?
  fi
  return 1
}

if ! build_payload; then
  printf '%s' '{"event":{},"transcript_path":"","transcript_exists":false,"transcript":"","read_error":"python3 not available"}' > "$tmp_out"
fi

if [[ -n "${HOOK_SINK_URL:-}" && -n "${HOOK_SINK_TOKEN:-}" ]]; then
  base="${HOOK_SINK_URL%/}"
  curl -sS \
    -o /dev/null \
    --connect-timeout 3 \
    --max-time 6 \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${HOOK_SINK_TOKEN}" \
    --data-binary "@${tmp_out}" \
    "${base}/subagent-stop" \
    >/dev/null 2>/dev/null || true
fi

printf '%s\n' '{}'
exit 0
