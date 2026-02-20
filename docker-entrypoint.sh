#!/bin/sh
# Replace the placeholder in index.html with the actual GEMINI_API_KEY
# env var injected by Cloud Run (set via Terraform).
# This runs at container startup before nginx begins serving.
set -e

INDEX_FILE="/usr/share/nginx/html/index.html"

if [ -z "${GEMINI_API_KEY}" ]; then
  echo "WARNING: GEMINI_API_KEY is not set. The Book a Slot feature will not work."
else
  echo "Injecting GEMINI_API_KEY into ${INDEX_FILE}..."
  sed -i "s|__GEMINI_API_KEY__|${GEMINI_API_KEY}|g" "${INDEX_FILE}"
  echo "Injection complete."
fi

exec nginx -g "daemon off;"
