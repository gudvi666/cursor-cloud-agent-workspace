#!/usr/bin/env bash
# Capture the exact Cursor hook stdin payload for Task pre/post ToolUse.
# Usage (from hooks.json): capture-task.sh pre|post
# Does not parse, trim, or reconstruct the payload.

event="${1:-}"

tmp="$(mktemp)"
cleanup() {
  rm -f "$tmp"
}
trap cleanup EXIT

# Preserve raw stdin bytes, including trailing newlines.
cat > "$tmp"

if [[ -n "${HOOK_SINK_URL:-}" && -n "${HOOK_SINK_TOKEN:-}" && ( "$event" == "pre" || "$event" == "post" ) ]]; then
  base="${HOOK_SINK_URL%/}"
  # Network failures must not affect the agent. Swallow curl errors.
  # stdout/stderr discarded so hook JSON on stdout stays clean.
  curl -sS \
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
