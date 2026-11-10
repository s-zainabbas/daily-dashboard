#!/bin/bash
# Double-click this file to open Daily Dashboard in your browser.
# Keep the Terminal window it opens running while you use the dashboard; close it to stop.

cd "$(dirname "$0")" || exit 1
PORT=5173
URL="http://localhost:$PORT"

# Find Node.js whether it came from the installer, Homebrew or nvm.
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if ! command -v npm >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js isn't installed. Get it from https://nodejs.org, then double-click this file again."
  read -r -n 1 -p "Press any key to close."
  exit 1
fi

# Already running (for example, from an earlier double-click)? Just open it.
if curl -s --max-time 2 "$URL" | grep -q "Daily Dashboard"; then
  echo "Daily Dashboard is already running. Opening it…"
  open "$URL"
  exit 0
fi
if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is being used by another app. Close it and try again."
  read -r -n 1 -p "Press any key to close."
  exit 1
fi

# First run: install what the dashboard needs.
if [ ! -d node_modules ]; then
  echo "First run: installing (about a minute)…"
  npm install || { read -r -n 1 -p "Install failed. Press any key to close."; exit 1; }
fi

echo ""
echo "  Daily Dashboard is running at $URL"
echo "  Keep this window open while you use it. Close it (or press Ctrl+C) to stop."
echo ""

# Open the browser once the server answers.
(
  for _ in $(seq 1 40); do
    curl -s --max-time 1 "$URL" >/dev/null && break
    sleep 0.25
  done
  open "$URL"
) &

exec npm run dev -- --port "$PORT" --strictPort
