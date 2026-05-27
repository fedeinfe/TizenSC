#!/bin/sh
# Concatenate src modules into a single IIFE for TizenBrew injection
set -e

mkdir -p dist

{
  printf "(function () {\n'use strict';\n\n"
  cat src/adblock.js
  printf "\n\n"
  cat src/navigation.js
  printf "\n\n"
  cat src/player.js
  printf "\n})();\n"
} > dist/userScript.js

echo "Built dist/userScript.js ($(wc -c < dist/userScript.js) bytes)"
