/**
 * Subgraph Configuration
 * Define all microservices that will be part of the Apollo Federation
 */
const getSubgraphURL = (envVar, defaultUrl) => {
    return process.env[envVar] || defaultUrl;
};
// Only include services that are explicitly enabled
const enabledServices = process.env.ENABLED_SERVICES
    ? process.env.ENABLED_SERVICES.split(',').map(s => s.trim())
    : ['despacho']; // Default to just despacho for local testing
export const SUBGRAPH_CONFIG = [
    ...(enabledServices.includes('autentificacion') ? [{
            name: 'autentificacion',
            url: getSubgraphURL('MS_AUTENTIFICACION_URL', 'http://localhost:8000/graphql'),
            timeout: 10000,
            retries: 3,
        }] : []),
    ...(enabledServices.includes('despacho') ? [{
            name: 'despacho',
            url: getSubgraphURL('MS_DESPACHO_URL', 'http://localhost:8001/graphql'),
            timeout: 10000,
            retries: 3,
        }] : []),
    ...(enabledServices.includes('recepcion') ? [{
            name: 'recepcion',
            url: getSubgraphURL('MS_RECEPCION_URL', 'http://localhost:8080/api/graphql'),
            timeout: 10000,
            retries: 3,
        }] : []),
    ...(enabledServices.includes('websocket') ? [{
            name: 'websocket',
            url: getSubgraphURL('MS_WEBSOCKET_URL', 'http://localhost:4004/graphql'),
            timeout: 10000,
            retries: 3,
        }] : []),
    ...(enabledServices.includes('decision') ? [{
            name: 'decision',
            url: getSubgraphURL('MS_DECISION_URL', 'http://localhost:8002/graphql'),
            timeout: 10000,
            retries: 3,
        }] : []),
    ...(enabledServices.includes('ml_despacho') ? [{
            name: 'ml_despacho',
            url: getSubgraphURL('MS_ML_DESPACHO_URL', 'http://localhost:5001/graphql'),
            timeout: 10000,
            retries: 3,
        }] : []),
];
/**
 * Gateway Configuration
 */
export const GATEWAY_CONFIG = {
    port: parseInt(process.env.PORT || '4000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    debug: process.env.DEBUG === 'true',
    // Service introspection and composition settings
    introspectionPollInterval: 10000, // Poll for schema changes every 10 seconds
    compositionTimeoutMs: 30000, // Wait up to 30 seconds for composition
};
/**
 * CORS Configuration
 */
export const CORS_CONFIG = {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: process.env.CORS_CREDENTIALS === 'true',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-ID'],
};
/**
 * Rate Limiting Configuration
 */
export const RATE_LIMIT_CONFIG = {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '15000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
};
/**
 * JWT Configuration
 */
export const JWT_CONFIG = {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRATION || '24h',
};
/**
 * Health Check Configuration
 */
export const HEALTH_CHECK_CONFIG = {
    interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
    serviceTimeout: parseInt(process.env.SERVICE_TIMEOUT || '10000', 10),
};
export default {
    SUBGRAPH_CONFIG,
    GATEWAY_CONFIG,
    CORS_CONFIG,
    RATE_LIMIT_CONFIG,
    JWT_CONFIG,
    HEALTH_CHECK_CONFIG,
};
//# sourceMappingURL=subgraphs.js.map