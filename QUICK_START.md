# Apollo Gateway - Quick Start Guide

## TL;DR - Empezar en 30 segundos

```bash
cd D:\SWII\micro_servicios
docker-compose up -d
sleep 30
curl http://localhost:4000/health/detailed | jq '.schemaReady'
# ✓ Debería mostrar: true
```

## ¿Qué cambió?

Apollo Gateway ahora **NO CRASHEA** si los microservicios no están disponibles al iniciar.

**Antes:**
```
apollo-gateway inicia
Intenta conectar a despacho:8001
ECONNREFUSED
CRASH ❌
```

**Ahora:**
```
apollo-gateway inicia
Intenta conectar a despacho:8001
ECONNREFUSED (sin crash)
Continúa corriendo ✓
Reintenta cada 10s
Cuando despacho se levanta → DESCUBIERTO ✓
```

## Requisitos

- Docker & Docker Compose instalados
- Git (para los commits)
- curl (para testing)

## Uso

### 1. Levantar TODO

```bash
cd D:\SWII\micro_servicios

# Levantar todos los servicios
docker-compose up -d

# Ver logs de Apollo Gateway
docker-compose logs -f apollo-gateway
```

**Logs esperados:**
```
[WARN] ⚠ Some services unavailable at startup (will keep retrying)
[WARN] ⚠ Service connectivity issue detected at startup...
```

No te preocupes, Apollo continúa intentando.

### 2. Verificar que se descubren los servicios

En otra terminal:

```bash
# Ver health simple
curl http://localhost:4000/health

# Ver health detallado (MEJOR)
curl http://localhost:4000/health/detailed | jq

# Esperar a que schemaReady sea true
while ! curl -s localhost:4000/health/detailed | grep -q '"schemaReady":true'; do
  echo "⏳ Esperando servicios..."
  sleep 2
done
echo "✅ Listo!"
```

### 3. Hacer un GraphQL Query

```bash
# Una vez que schemaReady=true
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

## Configuración

Editar `docker-compose.yml` en la raíz para:

### Habilitar/Deshabilitar Servicios

```yaml
apollo-gateway:
  environment:
    # Servicos separados por comas
    ENABLED_SERVICES: despacho,autentificacion,recepcion
```

### Cambiar URLs de Servicios

Si tus servicios corren en puertos diferentes:

```yaml
apollo-gateway:
  environment:
    MS_DESPACHO_URL: http://ms-despacho:8001/graphql
    MS_AUTENTIFICACION_URL: http://ms-autentificacion:8000/graphql
    # etc...
```

### Variables de Seguridad (IMPORTANTE EN PRODUCCIÓN)

```yaml
apollo-gateway:
  environment:
    API_KEY_ADMIN: "CAMBIAR_ESTO"
    JWT_SECRET: "CAMBIAR_ESTO"
```

## Health Checks

### `/health` - Simple

```bash
curl http://localhost:4000/health
```

Response:
```json
{
  "status": "ok",
  "service": "apollo-gateway",
  "uptime": 15.234
}
```

**Cuando verificar:** Docker health check usa este endpoint

### `/health/detailed` - Completo

```bash
curl http://localhost:4000/health/detailed | jq
```

Response:
```json
{
  "status": "ok",
  "schemaReady": true,           ← IMPORTANTE!
  "readyForRequests": true,      ← IMPORTANTE!
  "subgraphs": [
    {
      "name": "despacho",
      "status": "healthy"         ← Verificar esto
    },
    {
      "name": "autentificacion",
      "status": "unreachable"     ← Servicio no disponible
    }
  ],
  "allHealthy": false            ← true cuando TODOS estén healthy
}
```

**Cómo usarlo:**
- `schemaReady=true` → Apollo está listo para requests GraphQL
- `allHealthy=true` → Todos los servicios están disponibles
- `subgraphs[].status` → Estado individual de cada servicio

## Troubleshooting

### "schemaReady": false después de 2 minutos

**Causa:** Algún servicio no se levantó
**Solución:**
```bash
# Ver logs de Apollo
docker-compose logs apollo-gateway

# Ver logs de un servicio específico
docker-compose logs ms-despacho

# Verificar que el servicio esté corriendo
docker ps | grep ms-despacho
```

### "Port already in use"

```bash
# Ver qué está usando el puerto 4000
lsof -i :4000   # macOS/Linux
netstat -ano | findstr :4000   # Windows

# O simplemente parar Docker
docker-compose down
```

### Apollo responde pero despacho no se descubre

**Verificar:**
```bash
# 1. ¿El servicio está corriendo?
docker ps | grep ms-despacho

# 2. ¿El URL es correcto?
docker-compose logs apollo-gateway | grep "despacho"

# 3. ¿El servicio tiene GraphQL en el puerto correcto?
curl http://localhost:8001/graphql   # Si está en localhost
# O desde dentro del container:
docker exec -it ms-despacho curl http://localhost:8001/graphql
```

## Desarrollo

### Trabajar en Apollo Gateway

```bash
# Editar código
code src/server.ts

# Compilar
npm run build

# Reconstruir imagen Docker
docker-compose up -d --build apollo-gateway

# Ver cambios
docker-compose logs -f apollo-gateway
```

### Trabajar en un Microservicio

```bash
# Editar y testear localmente
cd ../ms-despacho
npm run dev

# Apollo lo descubrirá automáticamente:
# - Apollo polling cada 10s
# - Cuando ms-despacho está listo → Descubierto
# - Schema se actualiza automáticamente
```

## Próximos Pasos

1. **Leer documentación completa:**
   - `RESILIENT_STARTUP_GUIDE.md` - Guía completa
   - `documentaciones/RESILIENT_STARTUP.md` - Detalles técnicos

2. **Entender la arquitectura:**
   - Apollo Gateway orquesta los microservicios
   - No usa Kubernetes ni orquestación compleja
   - Discovery automático cada 10 segundos

3. **Para producción:**
   - Cambiar `API_KEY_ADMIN` y `JWT_SECRET`
   - Cambiar `NODE_ENV` a `production`
   - Configurar base de datos real
   - Usar variables de entorno seguras

## Comandos Útiles

```bash
# Ver todos los logs
docker-compose logs -f

# Ver logs de un servicio
docker-compose logs -f apollo-gateway
docker-compose logs -f ms-despacho

# Entrar a un container
docker exec -it apollo-gateway sh
docker exec -it ms-despacho sh

# Parar todo
docker-compose down

# Parar y borrar volúmenes (cuidado!)
docker-compose down -v

# Reconstruir todo
docker-compose up -d --build

# Limpiar imágenes no usadas
docker image prune -a

# Ver estado de servicios
docker-compose ps
```

## Monitoreo en Tiempo Real

```bash
# Crear un loop que monitoree health
watch -n 2 'curl -s http://localhost:4000/health/detailed | jq ".schemaReady, .subgraphs"'
```

## Debugging

### Verificar conectividad de servicios

```bash
# Desde el container de Apollo
docker exec apollo-gateway curl http://ms-despacho:8001/graphql

# Si falla, verificar que están en el mismo network
docker network ls
docker network inspect micro_servicios_swii-network
```

### Ver GraphQL Schema

Una vez que `schemaReady=true`:

```bash
curl http://localhost:4000/schema
```

Muestra el schema completo compilado por Apollo.

## Más Información

- Apollo Gateway Docs: https://www.apollographql.com/docs/apollo-server/federation/
- Apollo Sandbox (IDE): http://localhost:4000/sandbox
- GraphQL Spec: https://spec.graphql.org/

---

¿Problemas? Lee `RESILIENT_STARTUP_GUIDE.md` o revisa los logs con:
```bash
docker-compose logs apollo-gateway
```
