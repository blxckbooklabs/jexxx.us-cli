#!/usr/bin/env bash
# Sync built dist into blxckchat.jexxx.us for solo-repo Vercel deploys.
set -euo pipefail

CLI_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BLXCKCHAT_ROOT="$(cd "${CLI_ROOT}/../blxckchat.jexxx.us" && pwd)"
SYNC_SCRIPT="${BLXCKCHAT_ROOT}/scripts/sync-vendor-cli.sh"

if [ ! -f "$SYNC_SCRIPT" ]; then
  echo "blxckchat sync script not found at ${SYNC_SCRIPT}" >&2
  echo "Run from monorepo: cd ../blxckchat.jexxx.us && bash scripts/sync-vendor-cli.sh" >&2
  exit 1
fi

bash "$SYNC_SCRIPT"
echo ""
echo "Next (from blxckchat.jexxx.us):"
echo "  git add vendor/jexxxus-cli"
echo "  git commit -m \"chore: sync vendored jexxx.us-cli dist\""
echo "  git push"