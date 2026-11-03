#!/usr/bin/env bash
# Ejecuta los scripts SQL en orden. Uso:
#   DB_SERVER=localhost DB_USER=sa DB_PASSWORD='...' ./run_all.sh [--reset]
# --reset ejecuta antes 000_Reiniciar.sql (borra la base).
# SKIP_SEED_GRANDE=1 omite 016 (la semilla grande de 50 000 pedidos).
set -euo pipefail
cd "$(dirname "$0")"
: "${DB_SERVER:?Defina DB_SERVER}" "${DB_USER:?Defina DB_USER}" "${DB_PASSWORD:?Defina DB_PASSWORD}"
run() { echo ">> $1"; sqlcmd -S "$DB_SERVER" -U "$DB_USER" -P "$DB_PASSWORD" -C -b -f 65001 -i "$1"; }
[[ "${1:-}" == "--reset" ]] && run 000_Reiniciar.sql
for f in [0-9][0-9][0-9]_*.sql; do [[ "$f" == 000_* ]] && continue; [[ "$f" == 016_* && "${SKIP_SEED_GRANDE:-0}" == "1" ]] && continue; run "$f"; done
echo "Base de datos lista."
