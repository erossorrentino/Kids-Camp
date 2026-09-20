#!/usr/bin/env bash
# Everything that can run without a browser, then the browser suites.
set -e
here="$(dirname "$0")"
"$here/check.sh"
node "$here/validate.mjs"
node "$here/smoke.mjs"
node "$here/sim.mjs" "${SIM_MAPS:-refinery,duneline,downtown,station,trench}"
node "$here/circuit.mjs"
echo "ALL TESTS PASS"
