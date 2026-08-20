#!/bin/bash
# Capture the exact Cursor hook stdin payload for Task pre/post ToolUse.
# Usage (from hooks.json): capture-task.sh pre|post
# Does not parse, trim, or reconstruct the payload.

event="${1:-}"

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [[ -f "${script_dir}/sink.env" ]]; then
  # Fallback when the hook runner does not inject Cloud secrets.
  # Existing HOOK_SINK_* values, if already set, are kept.
  set -a
  # shellcheck disable=SC1091
  . "${script_dir}/sink.env"
  set +a
fi

tmp="$(/usr/bin/mktemp /tmp/capture-task.XXXXXX 2>/dev/null || mktemp)"
cleanup() {
  rm -f "$tmp"
}
trap cleanup EXIT

# Preserve raw stdin bytes, including trailing newlines.
cat > "$tmp"

curl_bin="${CURL_BIN:-}"
if [[ -z "$curl_bin" ]]; then
  if [[ -x /usr/bin/curl ]]; then
    curl_bin=/usr/bin/curl
  else
    curl_bin="$(command -v curl 2>/dev/null || true)"
  fi
fi

if [[ -n "${HOOK_SINK_URL:-}" && -n "${HOOK_SINK_TOKEN:-}" && -n "$curl_bin" && ( "$event" == "pre" || "$event" == "post" ) ]]; then
  base="${HOOK_SINK_URL%/}"
  # Network failures must not affect the agent. Swallow curl errors.
  # stdout/stderr discarded so hook JSON on stdout stays clean.
  "$curl_bin" -sS \
    -o /dev/null \
    --connect-timeout 3 \
    --max-time 8 \
    -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${HOOK_SINK_TOKEN}" \
    --data-binary "@${tmp}" \
    "${base}/${event}" \
    >/dev/null 2>/dev/null || true
fi

if [[ "$event" == "pre" ]]; then
  printf '%s\n' '{"permission":"allow"}'
else
  printf '%s\n' '{}'
fi

exit 0
