#!/bin/sh
set -eu
mkdir -p dist/icons
cp add.html app.js embed.html guide.html index.html projects.html share.html snippets.json style.css sync.html test.html dist/
cp icons/*.png dist/icons/
