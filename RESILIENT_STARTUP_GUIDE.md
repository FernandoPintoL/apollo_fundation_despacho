# Resilient Startup Guide - Apollo Gateway

## Overview

The Apollo Gateway now runs in **Resilient Mode**, allowing it to start and remain operational even if some or all configured microservices are unavailable. This enables flexible service orchestration without complex docker-compose dependencies.

## Key Features

✅ **Starts Successfully with 0 or Partial Services**
- Gateway will not crash if services are unavailable at startup
- Continues to serve health and monitoring endpoints

✅ **Continuous Service Discovery**
- Automatically polls for service availability every 10 seconds
- Dynamically loads services as they come online
- No restart required

✅ **Schema Readiness Tracking**
- `/health` endpoint reports overall gateway status
- `/health/detailed` shows which services are available/unavailable
- Applications can check `schemaReady` flag before querying

✅ **Graceful Degradation**
- If all services are down: Gateway serves health/metrics endpoints only
- If some services are available: Gateway provides partial schema
- If all services are up: Gateway provides complete federated schema

## Starting the Gateway

### Basic Usage

```bash
npm start
```

Expected output with no services running:

```
[ENV LOADER SUCCESS] .env file loaded
[GATEWAY CONFIG] Starting in RESILIENT mode
[GATEWAY CONFIG] Configured services: 5
  • autentificacion: http://localhost:8000/graphql
  • despacho: http://localhost:8001/graphql
  • websocket: http://localhost:4004/graphql
  • decision: http://localhost:8002/graphql
  • ml_despacho: http://localhost:5000/graphql

[APOLLO SERVER] Started but schema composition failed
[APOLLO SERVER] Gateway will serve /health and /metrics endpoints
[APOLLO SERVER] Waiting for services to become available...

╔════════════════════════════════════════╗
║   Apollo Gateway Server Started        ║
╠════════════════════════════════════════╣
║ URL:      http://localhost:4000/graphql      ║
║ Health:   http://localhost:4000/health        ║
║ Status:   http://localhost:4000/status        ║
╚════════════════════════════════════════╝
```

## Monitoring Gateway Health

### Health Check Endpoint

```bash
curl http://localhost:4000/health
```

Response:
```json
{
  "status": "ok",
  "service": "apollo-gateway",
  "timestamp": "2025-11-12T04:35:56.077Z",
  "uptime": 10.24
}
```

### Detailed Health Check

```bash
curl http://localhost:4000/health/detailed
```

Response when no services available:
```json
{
  "status": "ok",
  "service": "apollo-gateway",
  "mode": "resilient",
  "schemaReady": false,
  "serverStarted": true,
  "services": {
    "available": [],
    "unavailable": [
      "autentificacion",
      "despacho",
      "websocket",
      "decision",
      "ml_despacho"
    ],
    "totalConfigured": 5
  },
  "allHealthy": false,
  "partiallyHealthy": false,
  "readyForRequests": false
}
```

Response when services are coming online:
```json
{
  "status": "ok",
  "service": "apollo-gateway",
  "mode": "resilient",
  "schemaReady": true,
  "serverStarted": true,
  "services": {
    "available": ["despacho"],
    "unavailable": [
      "autentificacion",
      "websocket",
      "decision",
      "ml_despacho"
    ],
    "totalConfigured": 5
  },
  "allHealthy": false,
  "partiallyHealthy": true,
  "readyForRequests": true
}
```

## Status Endpoint

```bash
curl http://localhost:4000/status
```

Response:
```json
{
  "status": "operational",
  "service": "apollo-gateway",
  "version": "1.0.0",
  "environment": "development",
  "timestamp": "2025-11-12T04:35:56.077Z"
}
```

## Metrics Endpoint (Prometheus)

```bash
curl http://localhost:4000/metrics
```

Response:
```
# HELP apollo_gateway_uptime Gateway uptime in seconds
# TYPE apollo_gateway_uptime gauge
apollo_gateway_uptime 42.5

# HELP apollo_gateway_info Gateway information
# TYPE apollo_gateway_info gauge
apollo_gateway_info{version="1.0.0"} 1
```

## GraphQL Endpoint

### When All Services Are Available

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { types { name } } }"}'
```

### When Services Are Unavailable

The `/graphql` endpoint will respond with an error until at least one service becomes available and the schema is composed.

## Configuration

Configure enabled services via the `.env` file:

```env
# Enabled Services (comma-separated list)
# Options: autentificacion, despacho, websocket, decision, ml_despacho
ENABLED_SERVICES=autentificacion,despacho,websocket,decision,ml_despacho

# Service URLs
MS_AUTENTIFICACION_URL=http://localhost:8000/graphql
MS_DESPACHO_URL=http://localhost:8001/graphql
MS_WEBSOCKET_URL=http://localhost:4004/graphql
MS_DECISION_URL=http://localhost:8002/graphql
MS_ML_DESPACHO_URL=http://localhost:5000/graphql
```

## Recommended Docker Compose Setup

No need for complex `depends_on` conditions. Just start services as they're ready:

```yaml
version: '3.8'

services:
  apollo-gateway:
    build: .
    ports:
      - "4000:4000"
    environment:
      NODE_ENV: development
      ENABLED_SERVICES: autentificacion,despacho,websocket,decision,ml_despacho
      RUNNING_IN_DOCKER: "true"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/health"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 30s  # Give gateway time to start

  despacho:
    # ... your service configuration
    depends_on:
      - apollo-gateway

  # Other services can start at their own pace
```

## Development Mode

```bash
npm run dev
```

Runs the gateway with hot-reload using `tsx watch`.

## Building for Production

```bash
npm run build
npm start
```

## Troubleshooting

### Gateway starts but schema is not ready

**Expected behavior**: If services aren't available, the gateway will log a warning and continue running.

```
[APOLLO SERVER] Started but schema composition failed
[APOLLO SERVER] Gateway will serve /health and /metrics endpoints
[APOLLO SERVER] Waiting for services to become available...
```

**Solution**: Start your microservices. The gateway will automatically discover them and update the schema.

### How to check if schema is ready?

Query the detailed health endpoint:

```bash
curl -s http://localhost:4000/health/detailed | grep "schemaReady"
```

Will return `"schemaReady": true` when at least one service is available.

### Service discovery takes too long

The gateway polls for service availability every 10 seconds. This is configured in `src/config/subgraphs.ts`:

```typescript
introspectionPollInterval: 10000, // ms
```

To change polling interval, update `GATEWAY_CONFIG.introspectionPollInterval`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | development | Environment (development/production) |
| `PORT` | 4000 | Gateway port |
| `DEBUG` | false | Enable debug logging |
| `ENABLED_SERVICES` | (required) | Comma-separated list of enabled services |
| `RUNNING_IN_DOCKER` | false | Set to 'true' when running in Docker |
| `MS_*_URL` | (required) | Service URLs for each microservice |

## More Information

- [Apollo Federation Docs](https://www.apollographql.com/docs/apollo-server/federation/introduction/)
- [Apollo Gateway Configuration](https://www.apollographql.com/docs/apollo-server/api/apollo-gateway/)
- [IntrospectAndCompose](https://www.apollographql.com/docs/apollo-server/api/gateway-class/#inspectvsd)
