#!/usr/bin/env bash
set -euo pipefail

COLLECTOR_URL="${COLLECTOR_URL:-http://localhost:4318}"
HEALTH_URL="${HEALTH_URL:-http://localhost:13133}"
DATA_DIR="${DATA_DIR:-.cache/sample}"
SAMPLE_URL="https://storage.googleapis.com/hyperdx/sample.tar.gz"

# ── Download ──────────────────────────────────────────────────────────────────

echo "==> Downloading HyperDX/ClickStack sample dataset..."
mkdir -p "$DATA_DIR"
if [[ ! -f "$DATA_DIR/logs.json" ]]; then
  curl -#L "$SAMPLE_URL" | tar xz -C "$DATA_DIR"
  echo "    Extracted to $DATA_DIR"
else
  echo "    Already cached in $DATA_DIR"
fi

# ── Wait for collector ────────────────────────────────────────────────────────

echo "==> Waiting for OTel Collector health check at $HEALTH_URL..."
until curl -sf "$HEALTH_URL" > /dev/null 2>&1; do
  printf "."
  sleep 1
done
echo " ready"

# ── Send data ─────────────────────────────────────────────────────────────────

send_file() {
  local file="$1"
  local endpoint="$2"
  local name="$3"
  local total
  total=$(wc -l < "$file")
  local i=0
  local errors=0

  echo "==> Sending $total $name export requests to $COLLECTOR_URL$endpoint..."
  while IFS= read -r line; do
    i=$((i + 1))
    if ! curl -sf "$COLLECTOR_URL$endpoint" \
      -X POST \
      -H "Content-Type: application/json" \
      -d "$line" > /dev/null 2>&1; then
      errors=$((errors + 1))
    fi
    if (( i % 200 == 0 )) || (( i == total )); then
      printf "\r    %d/%d sent" "$i" "$total"
    fi
  done < "$file"
  printf "\n"
  if (( errors > 0 )); then
    echo "    Warning: $errors/$total requests failed"
  fi
}

send_file "$DATA_DIR/traces.json" "/v1/traces" "trace"
send_file "$DATA_DIR/logs.json" "/v1/logs" "log"
send_file "$DATA_DIR/metrics.json" "/v1/metrics" "metric"

# ── Verify ────────────────────────────────────────────────────────────────────

echo ""
echo "==> Done! Verifying row counts..."
sleep 3  # let the batch processor flush

for table in otel_traces otel_logs otel_metrics_gauge otel_metrics_sum otel_metrics_histogram otel_metrics_exponential_histogram; do
  count=$(curl -sf "http://localhost:8123/?query=SELECT+count()+FROM+default.$table" 2>/dev/null || echo "N/A")
  printf "    %-45s %s rows\n" "$table" "$count"
done

echo ""
echo "ClickHouse HTTP: http://localhost:8123"
echo "Example:  curl 'http://localhost:8123' -d 'SELECT ServiceName, count() FROM default.otel_traces GROUP BY ServiceName'"
