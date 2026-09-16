#!/usr/bin/env bash
# Runs the full ORVIX demo scenario against a locally running instance
# (see README "Local setup"). Requires `curl` and `python3`.
set -euo pipefail

BASE_URL="${ORVIX_BASE_URL:-http://127.0.0.1:8000}"

echo "== ORVIX demo: auto-resolved incident (payment-service DB pool exhaustion) =="
curl -s -X POST "$BASE_URL/api/simulation/reset" > /dev/null
curl -s -X POST "$BASE_URL/api/simulation/failures/database?service=payment-service&severity=0.9" | python3 -m json.tool
echo "Waiting for the autonomous monitoring loop to detect + resolve (~10s)..."
sleep 10
curl -s "$BASE_URL/api/incidents" | python3 -m json.tool

echo
echo "== ORVIX demo: human-approval scenario (order-service CPU pressure) =="
curl -s -X POST "$BASE_URL/api/simulation/failures" \
  -H "Content-Type: application/json" \
  -d '{"service":"order-service","kind":"cpu","severity":0.9}' | python3 -m json.tool
echo "Waiting for detection + diagnosis + approval request (~8s)..."
sleep 8
curl -s "$BASE_URL/api/approvals?decision=PENDING" | python3 -m json.tool

echo
echo "Approve the pending action with:"
echo "  curl -X POST $BASE_URL/api/approvals/<approval_id>/approve \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"approver\": \"sre@orvix.local\", \"reason\": \"looks safe\"}'"
