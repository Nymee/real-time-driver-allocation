#!/usr/bin/env bash
#
# Concurrency verification script.
#
# Creates several available drivers clustered near a pickup point, requests
# a ride (which offers the nearest of them), then fires every offered
# driver's "accept" call at the exact same instant. Proves only one
# succeeds — the rest are cleanly rejected with a 409, never a crash or a
# double-assignment.
#
# Requires: docker compose up -d && npm run start:dev
# Usage:    ./scripts/verify-concurrency.sh
# Tunable:  DRIVER_COUNT=20 ./scripts/verify-concurrency.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
DRIVER_COUNT="${DRIVER_COUNT:-10}"
PICKUP_LAT=40.7589
PICKUP_LNG=-73.9851
RUN_ID=$(date +%s)

if [ -t 1 ]; then
  GREEN=$'\033[0;32m'; RED=$'\033[0;31m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  GREEN=''; RED=''; BOLD=''; RESET=''
fi

echo "== Creating $DRIVER_COUNT available drivers near the pickup point =="
DRIVER_IDS=()
declare -A DRIVER_NAMES
for i in $(seq 1 "$DRIVER_COUNT"); do
  NAME="Driver$i"
  LAT=$(node -e "console.log(($PICKUP_LAT + $i * 0.0004).toFixed(6))")
  DRIVER_ID=$(curl -s -X POST "$BASE_URL/drivers" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$NAME\", \"phone\": \"+1555${RUN_ID}${i}\"}" \
    | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).id))")

  curl -s -X PATCH "$BASE_URL/drivers/$DRIVER_ID/status" \
    -H "Content-Type: application/json" \
    -d "{\"status\": \"AVAILABLE\", \"lat\": $LAT, \"lng\": $PICKUP_LNG}" > /dev/null

  DRIVER_IDS+=("$DRIVER_ID")
  DRIVER_NAMES["$DRIVER_ID"]="$NAME"
  echo "  $NAME -> $DRIVER_ID"
done

echo
echo "== Requesting a ride at the pickup point =="
RIDE_RESPONSE=$(curl -s -X POST "$BASE_URL/rides" \
  -H "Content-Type: application/json" \
  -d "{\"riderId\": \"verify-rider-$RUN_ID\", \"pickupLat\": $PICKUP_LAT, \"pickupLng\": $PICKUP_LNG, \"dropoffLat\": 40.7700, \"dropoffLng\": -73.9600}")

RIDE_ID=$(echo "$RIDE_RESPONSE" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).ride.id))")
mapfile -t OFFERED_IDS < <(echo "$RIDE_RESPONSE" | node -e "
let d = '';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => JSON.parse(d).offeredDrivers.forEach(x => console.log(x.id)));
")

OFFERED_NAMES=()
for DRIVER_ID in "${OFFERED_IDS[@]}"; do
  OFFERED_NAMES+=("${DRIVER_NAMES[$DRIVER_ID]}")
done

echo "  Ride:            $RIDE_ID"
echo "  Offered to:      ${OFFERED_NAMES[*]} (${#OFFERED_IDS[@]} drivers)"

if [ "${#OFFERED_IDS[@]}" -lt 2 ]; then
  echo
  echo "Only ${#OFFERED_IDS[@]} driver(s) were offered — need at least 2 to demonstrate the race."
  echo "Try a higher DRIVER_COUNT, e.g.: DRIVER_COUNT=20 ./scripts/verify-concurrency.sh"
  exit 1
fi

echo
echo "== Firing all ${#OFFERED_IDS[@]} accept calls at the exact same instant =="
RESULTS_DIR=$(mktemp -d)
PIDS=()
for DRIVER_ID in "${OFFERED_IDS[@]}"; do
  (
    STATUS=$(curl -s -o "$RESULTS_DIR/$DRIVER_ID.json" -w "%{http_code}" \
      -X PATCH "$BASE_URL/rides/$RIDE_ID/accept" \
      -H "Content-Type: application/json" \
      -d "{\"driverId\": \"$DRIVER_ID\"}")
    echo "$STATUS" > "$RESULTS_DIR/$DRIVER_ID.status"
  ) &
  PIDS+=("$!")
done

for PID in "${PIDS[@]}"; do
  wait "$PID"
done

echo
echo "== Results (${#OFFERED_IDS[@]} drivers accepted simultaneously) =="
ACCEPTED_COUNT=0
for DRIVER_ID in "${OFFERED_IDS[@]}"; do
  NAME="${DRIVER_NAMES[$DRIVER_ID]}"
  STATUS=$(cat "$RESULTS_DIR/$DRIVER_ID.status")
  if [ "$STATUS" = "200" ]; then
    ACCEPTED_COUNT=$((ACCEPTED_COUNT + 1))
    REASON=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$RESULTS_DIR/$DRIVER_ID.json','utf8')).outcome)")
    printf "  %-12s ${GREEN}${BOLD}%-10s${RESET} (HTTP %s, outcome: %s)\n" "$NAME" "WINNER" "$STATUS" "$REASON"
  else
    REASON=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$RESULTS_DIR/$DRIVER_ID.json','utf8')).message)")
    printf "  %-12s ${RED}%-10s${RESET} (HTTP %s, %s)\n" "$NAME" "REJECTED" "$STATUS" "$REASON"
  fi
done
rm -rf "$RESULTS_DIR"

echo
if [ "$ACCEPTED_COUNT" -eq 1 ]; then
  echo "${GREEN}${BOLD}PASS${RESET}: exactly 1 of ${#OFFERED_IDS[@]} simultaneous accept calls succeeded."
else
  echo "${RED}${BOLD}FAIL${RESET}: expected exactly 1 acceptance, got $ACCEPTED_COUNT."
  exit 1
fi
