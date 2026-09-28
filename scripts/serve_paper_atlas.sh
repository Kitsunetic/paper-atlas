#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${1:-4174}"

cd "$repository_root"
node src/paper-atlas/scripts/build_payloads.mjs
exec python3 -m http.server "$port" --directory src/paper-atlas/public
