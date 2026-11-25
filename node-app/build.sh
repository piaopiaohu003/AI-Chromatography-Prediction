#!/bin/sh
# Build the deployment bundle under dist/.
set -eu
cd "$(dirname "$0")"

# 本地仓库中前端源码位于仓库根的 static/，构建前先同步，避免线上使用旧资源。
if [ -d ../static ]; then
  rm -rf public
  mkdir -p public/static
  cp ../static/index.html public/index.html
  cp -R ../static/css ../static/js public/static/
fi

rm -rf dist
mkdir -p dist
cp server.js package.json run.sh dist/
cp -R lib dist/lib
cp -R public dist/public
chmod 755 dist/run.sh
