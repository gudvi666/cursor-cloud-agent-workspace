#!/bin/bash
# Capture raw subagentStop payload and, when possible, the transcript file.
# stdout must remain only `{}`. Network/read failures must not fail the hook.

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [[ -f "${script_dir}/sink.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "${script_dir}/sink.env"
  set +a
fi

tmp_in="$(/usr/bin/mktemp /tmp/capture-stop-in.XXXXXX 2>/dev/null || mktemp)"
tmp_out="$(/usr/bin/mktemp /tmp/capture-stop-out.XXXXXX 2>/dev/null || mktemp)"
cleanup() {
  rm -f "$tmp_in" "$tmp_out"
}
trap cleanup EXIT

cat > "$tmp_in"

python_bin=""
if [[ -x /usr/bin/python3 ]]; then
  python_bin=/usr/bin/python3
else
  python_bin="$(command -v python3 2>/dev/null || true)"
fi

build_payload() {
  if [[ -z "$python_bin" ]]; then
    return 1
  fi
  "$python_bin" - "$tmp_in" "$tmp_out" <<'PY'
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
}

if ! build_payload; then
  printf '%s' '{"event":{},"transcript_path":"","transcript_exists":false,"transcript":"","read_error":"python3 not available"}' > "$tmp_out"
fi

curl_bin=""
if [[ -x /usr/bin/curl ]]; then
  curl_bin=/usr/bin/curl
else
  curl_bin="$(command -v curl 2>/dev/null || true)"
fi

if [[ -n "${HOOK_SINK_URL:-}" && -n "${HOOK_SINK_TOKEN:-}" && -n "$curl_bin" ]]; then
  base="${HOOK_SINK_URL%/}"
  "$curl_bin" -sS \
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
