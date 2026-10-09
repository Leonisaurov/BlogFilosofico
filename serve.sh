#!/data/data/com.termux/files/usr/bin/bash
# Servidor local sin dependencias para el Blog de Filosofía.
# Uso: ./serve.sh [puerto]   (por defecto 8080)
set -euo pipefail

PORT="${1:-8080}"
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Blog de Filosofía → http://localhost:${PORT}"
echo "También accesible desde el teléfono en http://<ip-local>:${PORT}"
echo "Ctrl+C para detener."
echo

exec python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "$ROOT"
