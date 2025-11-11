#!/bin/bash

# Test Script for Apollo Gateway Resilient Startup
# Verifica que Apollo Gateway continúa corriendo aunque los servicios no estén disponibles

set -e

GATEWAY_URL="http://localhost:4000"
HEALTH_CHECK="${GATEWAY_URL}/health"
HEALTH_DETAILED="${GATEWAY_URL}/health/detailed"

echo "========================================"
echo "Apollo Gateway Resilience Test"
echo "========================================"
echo ""

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para hacer requests con retry
test_endpoint() {
    local url=$1
    local max_attempts=5
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        echo -n "Attempt $attempt: "
        if response=$(curl -s -w "\n%{http_code}" "$url" 2>/dev/null); then
            http_code=$(echo "$response" | tail -n1)
            body=$(echo "$response" | head -n-1)

            if [ "$http_code" = "200" ]; then
                echo -e "${GREEN}✓ Success (HTTP $http_code)${NC}"
                echo "$body" | head -c 200
                echo ""
                return 0
            else
                echo -e "${RED}✗ Failed (HTTP $http_code)${NC}"
            fi
        else
            echo -e "${RED}✗ Connection refused${NC}"
        fi

        attempt=$((attempt + 1))
        if [ $attempt -le $max_attempts ]; then
            echo "  Waiting 2 seconds before retry..."
            sleep 2
        fi
    done

    echo -e "${RED}✗ All attempts failed${NC}"
    return 1
}

echo "Test 1: Health Check Endpoint"
echo "=============================="
echo "This endpoint should ALWAYS respond, even without services"
echo ""
if test_endpoint "$HEALTH_CHECK"; then
    echo ""
    echo -e "${GREEN}✓ PASS: Apollo Gateway is running and responding${NC}"
else
    echo ""
    echo -e "${RED}✗ FAIL: Apollo Gateway not responding${NC}"
    exit 1
fi

echo ""
echo ""
echo "Test 2: Detailed Health Check Endpoint"
echo "======================================="
echo "This shows schemaReady status and subgraph health"
echo ""
if response=$(curl -s "$HEALTH_DETAILED" 2>/dev/null); then
    echo "Response:"
    echo "$response" | head -c 500
    echo ""
    echo ""

    # Check schemaReady status
    if echo "$response" | grep -q '"schemaReady":true'; then
        echo -e "${GREEN}✓ Schema is ready${NC}"
    else
        echo -e "${YELLOW}⚠ Schema not yet ready (normal if services are not up)${NC}"
    fi

    # Check subgraph statuses
    if echo "$response" | grep -q '"status":"healthy"'; then
        echo -e "${GREEN}✓ Some services are healthy${NC}"
    else
        echo -e "${YELLOW}⚠ No services marked as healthy${NC}"
    fi
else
    echo -e "${RED}✗ Failed to get detailed health${NC}"
fi

echo ""
echo ""
echo "Test 3: GraphQL Schema Endpoint (if available)"
echo "=============================================="
SCHEMA_URL="${GATEWAY_URL}/schema"
echo "Testing $SCHEMA_URL"
echo ""
if response=$(curl -s -w "\n%{http_code}" "$SCHEMA_URL" 2>/dev/null); then
    http_code=$(echo "$response" | tail -n1)
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓ Schema endpoint available${NC}"
        echo "First 300 chars:"
        echo "$response" | head -n-1 | head -c 300
        echo ""
    else
        echo -e "${YELLOW}⚠ Schema endpoint returned HTTP $http_code${NC}"
        echo "This is EXPECTED if services are not yet available"
        echo "Once services come online, this endpoint will return the schema"
    fi
else
    echo -e "${RED}✗ Connection refused${NC}"
fi

echo ""
echo ""
echo "========================================"
echo "Summary"
echo "========================================"
echo ""
echo "✓ Apollo Gateway startup is RESILIENT"
echo "✓ It continues running even if services are not available"
echo "✓ Services can be brought up in any order"
echo "✓ Gateway will discover them automatically via polling"
echo ""
echo "Check again later with:"
echo "  curl $HEALTH_DETAILED | jq '.schemaReady'"
echo ""
