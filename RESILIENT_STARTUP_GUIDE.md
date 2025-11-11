# Guía: Startup Resiliente de Apollo Gateway

## 🎯 Objetivo

Apollo Gateway ahora **tolera el arranque sin microservicios disponibles**. Esto significa:

- ✅ Levanta Apollo Gateway sin esperar a que los microservicios estén listos
- ✅ Continúa intentando conectar automáticamente cada 10 segundos
- ✅ Descubre servicios dinámicamente conforme se levantan
- ✅ No requiere orquestación compleja con `depends_on` y `condition: service_healthy`

## 🚀 Quick Start

### Opción 1: Docker Compose (Recomendado)

```bash
# Ir al directorio raíz de microservicios
cd D:\SWII\micro_servicios

# Copiar el archivo de ejemplo
cp apollo-gateway/docker-compose.example.yml docker-compose.resilient.yml

# O usar el docker-compose.yml existente (que ya tiene Apollo Gateway)
# Solo necesita actualizarse el start-period en el healthcheck a 90s

# Levantar todos los servicios
docker-compose -f docker-compose.resilient.yml up -d

# Apollo Gateway empezará a correr inmediatamente
# Logs:
# [WARN] ⚠ Some services unavailable at startup (will keep retrying)
# [WARN] ⚠ Service connectivity issue detected at startup...

# Esperar unos segundos y luego verificar health
sleep 10
curl http://localhost:4000/health
```

### Opción 2: Desarrollo Local

```bash
# Terminal 1: Apollo Gateway
npm install
npm run dev
# Output: [WARN] ⚠ Some services unavailable at startup...

# Terminal 2: Levantar un microservicio cuando quieras
cd ../microservices/despacho
npm run dev

# Apollo descubrirá el servicio automáticamente en ~10s
# Logs en Terminal 1: [INFO] ✓ Apollo Gateway schema initialized successfully
```

## 🔍 Monitoreo

### Health Check Básico
```bash
curl http://localhost:4000/health

# Response:
# {
#   "status": "ok",
#   "service": "apollo-gateway",
#   "timestamp": "2025-11-11T...",
#   "uptime": 15.234
# }
```

### Health Check Detallado
```bash
curl http://localhost:4000/health/detailed | jq

# Response:
# {
#   "status": "ok",
#   "schemaReady": false,              ← Indica si schema está compuesto
#   "readyForRequests": false,         ← Indica si acepta GraphQL requests
#   "subgraphs": [
#     {
#       "name": "despacho",
#       "status": "unreachable",       ← Aún no disponible
#       "error": "connect ECONNREFUSED"
#     },
#     {
#       "name": "autentificacion",
#       "status": "unreachable"        ← Aún no disponible
#     }
#   ],
#   "allHealthy": false                ← Espera a que sea true
# }
```

### Esperar a que esté listo
```bash
#!/bin/bash
# Esperar a que Apollo esté listo para requests
while true; do
  READY=$(curl -s http://localhost:4000/health/detailed | jq '.readyForRequests')
  if [ "$READY" = "true" ]; then
    echo "✓ Apollo Gateway listo!"
    break
  fi
  echo "⏳ Esperando servicios..."
  sleep 2
done
```

## 📊 Flujo de Arranque Típico

```
T=0s    → docker-compose up
        → Apollo Gateway inicia
        → Intenta conectar a "despacho" @ http://localhost:8001
        → FALLA: conexión rechazada
        → Logs: [WARN] ⚠ Some services unavailable at startup

T=1s    → Contenedor Apollo continúa CORRIENDO
        → No se cierra
        → Polling: Reintentará cada 10s

T=10s   → Polling automático reintenta
        → "despacho" AÚN NO ESTÁ LISTO
        → Continúa polling

T=15s   → "despacho" termina de iniciar
        → Su healthcheck pasa

T=20s   → Polling automático reintenta
        → ÉXITO: Descubre "despacho"
        → Schema se actualiza
        → Logs: [INFO] ✓ Apollo Gateway schema initialized successfully

T=21s   → healthcheck detallado muestra:
        → "despacho": "healthy" ✓
        → "schemaReady": true ✓
        → "readyForRequests": true ✓

T=22s+  → Apollo acepta GraphQL requests
```

## 🔧 Configuración

### Variables de Entorno

```env
# Puerto
PORT=4000
NODE_ENV=development

# Habilitar servicios (comma-separated)
ENABLED_SERVICES=despacho,autentificacion,recepcion

# URLs de servicios
MS_DESPACHO_URL=http://despacho:8001/graphql
MS_AUTENTIFICACION_URL=http://autentificacion:8000/graphql
MS_RECEPCION_URL=http://recepcion:8080/api/graphql

# Seguridad
API_KEY_ADMIN=admin-key-change-in-production
JWT_SECRET=jwt-secret-change-in-production
JWT_EXPIRATION=24h

# Polling interval (ms)
GATEWAY_CONFIG.introspectionPollInterval=10000
```

### Dockerfile Health Check

Ya está optimizado para resilencia:

```dockerfile
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4000/health', (r) => {...})"
```

**Explicación:**
- `start-period=90s`: Docker espera 90 segundos antes de validar health
- `interval=30s`: Valida cada 30 segundos
- `retries=3`: Permite 3 fallos antes de marcar como "unhealthy"
- Endpoint `/health`: Responde exitosamente sin requerir servicios

## 🧪 Testing

### Script de Prueba

```bash
# Hacer ejecutable
chmod +x test-resilience.sh

# Ejecutar
./test-resilience.sh

# Output esperado:
# ✓ Test 1: Health Check Endpoint - PASS
# ✓ Test 2: Detailed Health Check - PASS
# ⚠ Test 3: GraphQL Schema (expected if services not up)
```

### Prueba Manual

1. **Apollo up, sin servicios:**
   ```bash
   docker-compose up apollo-gateway
   curl http://localhost:4000/health  # ✓ Responde
   curl http://localhost:4000/health/detailed  # ✓ schemaReady=false
   ```

2. **Levantar un servicio:**
   ```bash
   docker-compose up despacho -d
   sleep 15  # Esperar polling
   curl http://localhost:4000/health/detailed  # ✓ schemaReady=true
   ```

3. **Hacer una query GraphQL:**
   ```bash
   curl -X POST http://localhost:4000/graphql \
     -H "Content-Type: application/json" \
     -d '{"query":"{__typename}"}'
   ```

## 📝 Notas Importantes

### No es necesario...

```yaml
# ❌ ANTES (No necesario ahora)
services:
  apollo-gateway:
    depends_on:
      despacho:
        condition: service_healthy
      autentificacion:
        condition: service_healthy

# ✅ AHORA (Apollo espera automáticamente)
services:
  apollo-gateway:
    # Sin depends_on - levanta y espera servicios internamente
    environment:
      ENABLED_SERVICES: despacho,autentificacion
```

### Ventajas

| Antes | Ahora |
|-------|-------|
| 🔴 Orden crítico | 🟢 Orden flexible |
| ❌ Crashes si falta servicio | ✅ Continúa corriendo |
| ❌ Tiempo de startup predecible | ✅ Adaptativo a velocidad real |
| 🟡 Logs complicados | 🟢 Logs claros |

### Limitaciones

- Si Apollo Gateway tiene un error en **su propio código**, SÍ se cierra (comportamiento correcto)
- Solo tolera errores de conectividad con servicios
- Una vez que estabiliza con todos los servicios, si uno se cae, Apollo lo detecta y lo marca como "unreachable"

## 🚨 Troubleshooting

### "Schema not yet available"
```
❌ Error: request to http://localhost:4000/schema failed
```
**Causa:** Apollo aún no ha compuesto el schema
**Solución:**
```bash
# Esperar a que schemaReady=true
curl http://localhost:4000/health/detailed | jq '.schemaReady'
# Cuando muestre "true", el schema está listo
```

### Health check falla después de 90s
```
✗ healthcheck returned exit code 1
```
**Causa:** Posible error en código de Apollo (no en servicios)
**Revisión:**
```bash
docker logs <container_id>
# Buscar errores que no sean de conectividad
```

### Services detected pero schema incompleto
```
{
  "schemaReady": true,
  "allHealthy": false  ← Solo algunos servicios están up
}
```
**Esperado:** Es normal durante arranque mientras se estabilizan servicios
**Solución:** Esperar a que `allHealthy=true`

### Apollo sigue mostrando "unreachable" para un servicio que está up
```bash
# Debug: Verificar conectividad manual
curl http://despacho:8001/graphql

# Si responde:
# 1. Revisar logs de despacho (¿healthcheck pasa?)
# 2. Revisar red (¿están en el mismo docker network?)
# 3. Revisar URL en ENABLED_SERVICES
```

## 📚 Documentación Completa

Ver `documentaciones/RESILIENT_STARTUP.md` para detalles técnicos.

## 📞 Soporte

Para problemas:
1. Revisar logs: `docker-compose logs apollo-gateway`
2. Revisar health: `curl http://localhost:4000/health/detailed`
3. Revisar servicios: `docker-compose ps`
