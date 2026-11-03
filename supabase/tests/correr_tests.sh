#!/bin/bash
# Corre los tests SQL contra un Postgres local (cada test con una base limpia: simulador de Supabase + todas las migraciones).
# Uso:  supabase/tests/correr_tests.sh                (todos los rls_*_test.sql)
#       supabase/tests/correr_tests.sh rls_cobros_test.sql
# Requiere un servidor Postgres local y poder ejecutar psql como el usuario "postgres" (ej. root: su postgres -c ...).
cd "$(dirname "$0")/../.."
PSQL="psql -q -v ON_ERROR_STOP=1 -d barber_test"
pg() { if [ "$(id -u)" = "0" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
run() { pg "$PSQL -f $1" > /tmp/barber_test_out.txt 2>&1; }
tests=("$@"); [ ${#tests[@]} -eq 0 ] && tests=($(cd supabase/tests && ls rls_*_test.sql))
fallo=0
for t in "${tests[@]}"; do
  pg "psql -q -c 'drop database if exists barber_test' -c 'create database barber_test'" >/dev/null 2>&1
  run supabase/tests/00_simular_supabase.sql || { echo "ERROR en el simulador"; cat /tmp/barber_test_out.txt; exit 1; }
  for m in supabase/migrations/*.sql; do run "$m" || { echo "ERROR en $m"; tail -5 /tmp/barber_test_out.txt; exit 1; }; done
  run "supabase/tests/$t"; rc=$?
  echo "$t: $(grep -c 'NOTICE:  OK' /tmp/barber_test_out.txt) chequeos OK (rc=$rc)"
  grep -E "FALLO|ERROR" /tmp/barber_test_out.txt && fallo=1
done
exit $fallo
