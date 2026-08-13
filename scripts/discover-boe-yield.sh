#!/usr/bin/env bash
set -euo pipefail
ZIP=".tmp/boe-latest-yield.zip"
DIR=".tmp/boe-latest-yield"
mkdir -p .tmp "$DIR"
curl -L --fail --silent --show-error \
  -A 'FinancialOS-MarketData/0.1 (+personal research)' \
  'https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip' \
  -o "$ZIP"
echo "BOE_ZIP_BYTES $(wc -c < "$ZIP")"
echo "BOE_ZIP_LIST"
unzip -l "$ZIP" | head -80
unzip -oq "$ZIP" -d "$DIR"
echo "BOE_EXTRACTED_FILES"
find "$DIR" -maxdepth 2 -type f -printf '%P\n' | head -80
