#!/bin/sh
# Build the deployment bundle under dist/.
set -eu
cd "$(dirname "$0")"

rm -rf dist
mkdir -p dist
cp server.js package.json run.sh dist/
cp -R lib dist/lib
cp -R public dist/public
chmod 755 dist/run.sh
