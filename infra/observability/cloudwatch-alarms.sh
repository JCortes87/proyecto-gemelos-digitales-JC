#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Alarmas de CloudWatch para Gemelo Digital (cuenta 718624265053, us-east-1).
#
# Crea/actualiza (idempotente: put-* sobrescribe por nombre):
#   - Tópico SNS "gemelo-digital-alerts" (+ suscripción por correo opcional)
#   - ALB:  5xx de la app, 5xx del balanceador (tareas caidas), latencia p95
#   - Logs: metric filters + alarmas para fallos del cron de sync, errores de
#           base de datos y excepciones no controladas
#   - RDS:  CPU alta y poco almacenamiento libre en gemelo-digital-db
#
# Uso:
#   ./cloudwatch-alarms.sh                         # DRY-RUN: solo imprime
#   APPLY=1 ALERT_EMAIL=alguien@cesa.edu.co ./cloudwatch-alarms.sh
#
# Tras aplicar con ALERT_EMAIL, AWS envía un correo de confirmación: hay que
# aceptarlo para empezar a recibir las alertas.
#
# Nota: Express Mode alterna entre dos target groups en cada deploy, por eso
# las alarmas del ALB usan solo la dimensión LoadBalancer (el ALB
# ecs-express-gateway solo atiende a gemelo-digital-api).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
export AWS_PAGER="" MSYS_NO_PATHCONV=1   # MSYS: no reescribir rutas /aws/... en Git Bash

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT="718624265053"
PREFIX="gemelo-digital"
TOPIC_NAME="${PREFIX}-alerts"
ALB_DIM="app/ecs-express-gateway-alb-1363866f/fbb34509e20ed37b"
LOG_GROUP="/aws/ecs/default/gemelo-digital-api-cbc4"
RDS_ID="gemelo-digital-db"
METRIC_NS="GemeloDigital"

APPLY="${APPLY:-0}"
ALERT_EMAIL="${ALERT_EMAIL:-}"

run() {
  if [[ "$APPLY" == "1" ]]; then
    "$@"
  else
    # A stderr: así se ve aunque el llamador redirija stdout a /dev/null.
    { printf '[dry-run]'; printf ' %q' "$@"; echo; } >&2
  fi
}

TOPIC_ARN="arn:aws:sns:${REGION}:${ACCOUNT}:${TOPIC_NAME}"

echo "== SNS"
run aws sns create-topic --region "$REGION" --name "$TOPIC_NAME" >/dev/null
if [[ -n "$ALERT_EMAIL" ]]; then
  run aws sns subscribe --region "$REGION" --topic-arn "$TOPIC_ARN" \
    --protocol email --notification-endpoint "$ALERT_EMAIL" >/dev/null
fi

# alarm NAME DESCRIPCION NAMESPACE METRIC STAT PERIOD EVAL DATAPOINTS THRESHOLD COMPARISON MISSING [DIMENSIONS...]
alarm() {
  local name="$1" desc="$2" ns="$3" metric="$4" stat="$5" period="$6" eval="$7" dp="$8" thr="$9" cmp="${10}" missing="${11}"
  shift 11
  local stat_args=(--statistic "$stat")
  [[ "$stat" == p* ]] && stat_args=(--extended-statistic "$stat")
  run aws cloudwatch put-metric-alarm --region "$REGION" \
    --alarm-name "${PREFIX}/${name}" --alarm-description "$desc" \
    --namespace "$ns" --metric-name "$metric" "${stat_args[@]}" \
    --period "$period" --evaluation-periods "$eval" --datapoints-to-alarm "$dp" \
    --threshold "$thr" --comparison-operator "$cmp" --treat-missing-data "$missing" \
    --alarm-actions "$TOPIC_ARN" --ok-actions "$TOPIC_ARN" \
    ${1:+--dimensions "$@"}
}

echo "== ALB"
alarm "alb-target-5xx" "La app devuelve 5xx (>=10 en 5 min, 2 de 3 periodos)" \
  AWS/ApplicationELB HTTPCode_Target_5XX_Count Sum 300 3 2 10 GreaterThanOrEqualToThreshold notBreaching \
  "Name=LoadBalancer,Value=${ALB_DIM}"
alarm "alb-elb-5xx" "El ALB responde 502/503/504 (tareas caidas o sin targets sanos)" \
  AWS/ApplicationELB HTTPCode_ELB_5XX_Count Sum 300 2 2 5 GreaterThanOrEqualToThreshold notBreaching \
  "Name=LoadBalancer,Value=${ALB_DIM}"
alarm "alb-latency-p95" "Latencia p95 > 5 s (3 de 5 periodos de 5 min)" \
  AWS/ApplicationELB TargetResponseTime p95 300 5 3 5 GreaterThanThreshold notBreaching \
  "Name=LoadBalancer,Value=${ALB_DIM}"

echo "== Logs (metric filters)"
# filter NOMBRE_METRICA PATRON
filter() {
  run aws logs put-metric-filter --region "$REGION" --log-group-name "$LOG_GROUP" \
    --filter-name "${PREFIX}-$1" --filter-pattern "$2" \
    --metric-transformations "metricName=$1,metricNamespace=${METRIC_NS},metricValue=1,defaultValue=0"
}
filter CronSyncFailures '"sync-cron-all" "FALLO"'
filter DbErrors '?"BD no disponible" ?"OperationalError" ?"usage_tracking: faltan tablas"'
filter UnhandledExceptions '?"Unhandled exception" ?"HTTP 500 en"'

alarm "cron-sync-failures" "Algun curso fallo en el cron de sincronizacion (ultima hora)" \
  "$METRIC_NS" CronSyncFailures Sum 3600 1 1 1 GreaterThanOrEqualToThreshold notBreaching
alarm "db-errors" "Errores de conexion/consulta a Postgres (>=3 en 10 min)" \
  "$METRIC_NS" DbErrors Sum 600 1 1 3 GreaterThanOrEqualToThreshold notBreaching
alarm "unhandled-exceptions" "Excepciones no controladas en la API (>=5 en 5 min)" \
  "$METRIC_NS" UnhandledExceptions Sum 300 1 1 5 GreaterThanOrEqualToThreshold notBreaching

echo "== RDS"
alarm "rds-cpu" "CPU de ${RDS_ID} > 80% durante 15 min" \
  AWS/RDS CPUUtilization Average 300 3 3 80 GreaterThanThreshold missing \
  "Name=DBInstanceIdentifier,Value=${RDS_ID}"
alarm "rds-free-storage" "Menos de 2 GB libres en ${RDS_ID}" \
  AWS/RDS FreeStorageSpace Minimum 300 1 1 2147483648 LessThanThreshold missing \
  "Name=DBInstanceIdentifier,Value=${RDS_ID}"

if [[ "$APPLY" != "1" ]]; then
  echo
  echo "DRY-RUN: no se creó nada. Para aplicar: APPLY=1 ALERT_EMAIL=<correo> $0"
fi
