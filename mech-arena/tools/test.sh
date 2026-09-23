#!/usr/bin/env bash
# Everything that can run without a browser, then the browser suites.
set -e
here="$(dirname "$0")"
"$here/check.sh"
node "$here/validate.mjs"
node "$here/smoke.mjs"
node "$here/build-artifact.mjs"
node "$here/mobile.mjs"
node "$here/handling.mjs"
node "$here/sim.mjs" "${SIM_MAPS:-refinery,duneline,downtown,station,trench}"
node "$here/circuit.mjs"
node "$here/leak.mjs"
echo "ALL TESTS PASS"
