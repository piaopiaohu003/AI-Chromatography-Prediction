#!/bin/sh
# Run the ChromAI Node backend in the foreground.
set -eu
cd "$(dirname "$0")"
exec node server.js
