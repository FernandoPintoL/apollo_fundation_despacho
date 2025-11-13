# ============================================
# Dockerfile - Apollo Gateway
# ============================================
# Multi-stage build optimizado para Node.js + TypeScript

ARG NODE_ENV=production

# STAGE 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependencias (incluyendo dev para compilación)
RUN npm ci

# Copiar código fuente
COPY src ./src

# Compilar TypeScript
RUN npm run build

# STAGE 2: Runtime
FROM node:20-alpine

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /app

# Instalar dumb-init y curl para health checks
RUN apk add --no-cache dumb-init curl

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production

# Copiar código compilado desde builder
COPY --from=builder /app/dist ./dist

# Copiar archivo .env para configuración de servicios en Docker
COPY .env ./

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Exponer puerto
EXPOSE 4000

# Health check mejorado con curl
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -f http://localhost:4000/health || exit 1

# Usar dumb-init para ejecutar la aplicación
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
