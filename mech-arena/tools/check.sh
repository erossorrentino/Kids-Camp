#!/usr/bin/env bash
# Full parse check of every module (see tools/check.mjs for why not --check).
exec node --experimental-vm-modules --no-warnings "$(dirname "$0")/check.mjs"
