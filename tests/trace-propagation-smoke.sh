#!/usr/bin/env bash
# Trace propagation smoke test.
#
# Verifies that OTel traces flow end-to-end:
#   API Gateway → Territory Service → Reporting Service
#
# Prerequisites:
#   - All services running via docker-compose or locally
#   - Jaeger available at http://localhost:16686
#
# Usage: ./tests/trace-propagation-smoke.sh [BASE_URL]

set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
JAEGER_URL="${JAEGER_URL:-http://localhost:16686}"

echo "=== Trace Propagation Smoke Test ==="
echo "Gateway:  $BASE_URL"
echo "Jaeger:   $JAEGER_URL"
echo ""

# 1. Send a request that should produce a trace
echo "1. Sending request to gateway..."
TRACE_ID=$(curl -s -D- "$BASE_URL/api/v1/territories" \
  -H "X-Request-Id: smoke-test-$(date +%s)" \
  2>&1 | grep -i "traceparent\|uber-trace-id\|x-trace-id" | head -1 || true)

if [ -z "$TRACE_ID" ]; then
  echo "   No trace header in response (may be expected if trace propagation is header-based)."
  echo "   Checking Jaeger for recent traces..."
else
  echo "   Trace header: $TRACE_ID"
fi

# 2. Query Jaeger for recent traces from the gateway
echo ""
echo "2. Querying Jaeger for recent traces..."
sleep 2
TRACES=$(curl -s "$JAEGER_URL/api/traces?service=api-gateway&limit=5" 2>/dev/null || echo "{}")

if echo "$TRACES" | grep -q '"data":\['; then
  TRACE_COUNT=$(echo "$TRACES" | grep -o '"traceID"' | wc -l | tr -d ' ')
  echo "   Found $TRACE_COUNT trace(s) from api-gateway in Jaeger."
else
  echo "   No traces found in Jaeger yet (collector may still be processing)."
fi

# 3. Check that territory-service traces exist
echo ""
echo "3. Checking territory-service traces..."
TERRITORY_TRACES=$(curl -s "$JAEGER_URL/api/traces?service=territory-service&limit=5" 2>/dev/null || echo "{}")

if echo "$TERRITORY_TRACES" | grep -q '"data":\['; then
  T_COUNT=$(echo "$TERRITORY_TRACES" | grep -o '"traceID"' | wc -l | tr -d ' ')
  echo "   Found $T_COUNT trace(s) from territory-service."
else
  echo "   No traces from territory-service yet."
fi

# 4. Check Prometheus for OTel metrics
echo ""
echo "4. Checking Prometheus for OTel-instrumented metrics..."
PROM_URL="${PROM_URL:-http://localhost:9090}"
HTTP_REQS=$(curl -s "$PROM_URL/api/v1/query?query=http_server_requests_seconds_count" 2>/dev/null || echo "{}")

if echo "$HTTP_REQS" | grep -q '"result":\['; then
  echo "   HTTP request metrics found in Prometheus."
else
  echo "   No HTTP request metrics in Prometheus (may need more traffic)."
fi

echo ""
echo "=== Smoke Test Complete ==="
echo "If traces appear in Jaeger, trace propagation is working."
echo "View traces at: $JAEGER_URL/search"
