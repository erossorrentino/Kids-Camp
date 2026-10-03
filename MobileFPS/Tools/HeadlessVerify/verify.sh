#!/usr/bin/env bash
# Headless verification for the MobileFPS Unity project (no Unity install or license needed).
#   1. Compiles every assembly (Core, Gameplay, Meta, UI, Editor, the three SDK
#      integrations, EditMode tests) against Unity 2021.3 reference assemblies.
#   2. Runs the EditMode test suite on .NET via NUnitLite with a managed UnityEngine shim.
# Requires the .NET 8 SDK. Exit code is non-zero on any compile error or test failure.
set -euo pipefail
cd "$(dirname "$0")"

projects=(Core Gameplay Meta UI Editor IntegrationAdMob IntegrationUnityIAP IntegrationNotifications TestsUnity)
for project in "${projects[@]}"; do
  echo "== compile $project"
  dotnet build "Projects/$project/$project.csproj" -nologo -v quiet -warnaserror:CS0618
done

echo "== run tests"
dotnet build TestRun/TestRun.csproj -nologo -v quiet
dotnet TestRun/bin/Debug/MobileFPS.TestRun.dll --noresult --labels=Off
