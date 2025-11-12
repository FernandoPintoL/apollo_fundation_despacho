/**
 * Apollo Gateway Server
 * Central GraphQL endpoint for SWII Microservices
 *
 * This server:
 * - Composes subgraphs from all microservices
 * - Provides a unified GraphQL API
 * - Handles authentication and authorization
 * - Monitors health of all subgraphs
 * - Provides real-time subscriptions support
 */
// MUST be first import - loads environment variables synchronously
import './load-env.js';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { ApolloGateway, IntrospectAndCompose, RemoteGraphQLDataSource } from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { WebSocketServer } from 'ws';
// Import custom modules AFTER environment is loaded
import { logger } from './utils/logger.js';
import { SUBGRAPH_CONFIG, GATEWAY_CONFIG, CORS_CONFIG } from './config/subgraphs.js';
import { resilientServiceChecker } from './gateway/resilient-gateway.js';
import { authenticateRequest, getCacheStats, } from './middleware/authentication-unified.js';
/**
 * Initialize Express Application
 */
const app = express();
const httpServer = createServer(app);
/**
 * Security & CORS Middleware
 */
// Disable CSP in development to allow Apollo Sandbox
if (process.env.NODE_ENV === 'production') {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://embeddable-sandbox.cdn.apollographql.com"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", "ws://localhost:*", "ws://*:*", "http://localhost:*", "http://*:*", "https://apollo-server-landing-page.cdn.apollographql.com", "https://embeddable-sandbox.cdn.apollographql.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
                manifestSrc: ["https://apollo-server-landing-page.cdn.apollographql.com"],
            }
        }
    }));
}
else {
    // Development: Disable CSP to allow Apollo Sandbox
    app.use(helmet({
        contentSecurityPolicy: false,
    }));
}
app.use(cors(CORS_CONFIG));
/**
 * Logging & Body Parsing Middleware
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
/**
 * Request logging
 */
app.use((req, res, _next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    _next();
});
/**
 * Apollo Gateway Setup - RESILIENT MODE
 *
 * This configuration allows the gateway to:
 * - Start successfully with 0 or partial services available
 * - Continuously poll for service availability (every 10s)
 * - Dynamically discover services as they come online
 * - Provide schema readiness status via /health/detailed endpoint
 */
logger.info('[GATEWAY CONFIG] Starting in RESILIENT mode');
logger.info(`[GATEWAY CONFIG] Configured services: ${SUBGRAPH_CONFIG.length}`);
SUBGRAPH_CONFIG.forEach(config => {
    logger.info(`  • ${config.name}: ${config.url}`);
});
// Use standard IntrospectAndCompose - errors will be handled gracefully
const gateway = new ApolloGateway({
    supergraphSdl: new IntrospectAndCompose({
        subgraphs: SUBGRAPH_CONFIG.map(config => ({
            name: config.name,
            url: config.url,
        })),
        pollIntervalInMs: GATEWAY_CONFIG.introspectionPollInterval,
    }),
    buildService({ url }) {
        // Custom data source that adds API key for subgraph requests
        return new RemoteGraphQLDataSource({
            url,
            willSendRequest({ request }) {
                // Add API key header for authentication
                request.http?.headers.set('X-API-Key', process.env.API_KEY_ADMIN || 'admin-key-change-in-production-12345');
            },
        });
    },
});
/**
 * Apollo Server Configuration
 */
const apolloServer = new ApolloServer({
    gateway,
    // Error formatting
    formatError: (formattedError, _error) => {
        logger.error(`GraphQL Error: ${formattedError.message}`, new Error(formattedError.message));
        // Hide sensitive information in production
        if (process.env.NODE_ENV === 'production') {
            return {
                message: 'Internal Server Error',
                extensions: { code: 'INTERNAL_SERVER_ERROR' },
            };
        }
        return formattedError;
    },
    // Plugins for monitoring and logging
    plugins: [
        {
            async serverWillStart() {
                logger.info('Apollo Gateway Server starting...');
                logger.info(`Registered Subgraphs: ${SUBGRAPH_CONFIG.length > 0 ? SUBGRAPH_CONFIG.map(s => s.name).join(', ') : 'None'}`);
            }
        }
    ],
    // Introspection enabled in development
    introspection: process.env.NODE_ENV !== 'production',
    // Apollo Sandbox (GraphQL IDE) enabled in development
    includeStacktraceInErrorResponses: process.env.NODE_ENV !== 'production',
});
/**
 * Register all non-Apollo-dependent routes FIRST
 * These can be registered before Apollo Server starts
 */
/**
 * Health Check Endpoint
 */
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'apollo-gateway',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
/**
 * Detailed Health Check with Subgraph Status
 */
app.get('/health/detailed', async (_req, res) => {
    try {
        // Get service health status
        const healthStatus = await resilientServiceChecker.checkServiceHealth();
        res.json({
            status: 'ok',
            service: 'apollo-gateway',
            mode: 'resilient',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            // Schema readiness
            schemaReady: schemaReady,
            serverStarted: serverStarted,
            // Service information
            services: {
                available: healthStatus.availableServices,
                unavailable: healthStatus.unavailableServices,
                totalConfigured: healthStatus.totalConfigured,
            },
            // Overall status
            allHealthy: healthStatus.unavailableServices.length === 0,
            partiallyHealthy: healthStatus.availableServices.length > 0,
            readyForRequests: schemaReady,
        });
    }
    catch (error) {
        logger.error('Error checking subgraph health', error);
        res.status(500).json({
            status: 'error',
            error: error.message,
        });
    }
});
/**
 * Metrics Endpoint (Prometheus format)
 */
app.get('/metrics', (_req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(`
# HELP apollo_gateway_uptime Gateway uptime in seconds
# TYPE apollo_gateway_uptime gauge
apollo_gateway_uptime ${process.uptime()}

# HELP apollo_gateway_info Gateway information
# TYPE apollo_gateway_info gauge
apollo_gateway_info{version="1.0.0"} 1
  `);
});
/**
 * Status Endpoint
 */
app.get('/status', (_req, res) => {
    res.json({
        status: 'operational',
        service: 'apollo-gateway',
        version: '1.0.0',
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
    });
});
/**
 * Root Endpoint
 */
app.get('/', (_req, res) => {
    res.json({
        message: 'Apollo Federation Gateway - SWII Microservices',
        graphql: '/graphql',
        sandbox: '/sandbox',
        health: '/health',
        status: '/status',
        documentation: 'https://www.apollographql.com/docs/apollo-server/federation/introduction/',
    });
});
/**
 * Apollo Sandbox Landing Page (GET /sandbox)
 */
app.get('/sandbox', (_req, res) => {
    res.set('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Apollo Sandbox - SWII Gateway</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            .container {
              background: white;
              border-radius: 12px;
              padding: 40px;
              max-width: 500px;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            }
            h1 {
              color: #333;
              margin: 0 0 20px 0;
            }
            p {
              color: #666;
              line-height: 1.6;
              margin: 0 0 20px 0;
            }
            .button {
              display: inline-block;
              background: #667eea;
              color: white;
              padding: 12px 24px;
              border-radius: 6px;
              text-decoration: none;
              font-weight: 500;
              margin: 10px 10px 10px 0;
              border: none;
              cursor: pointer;
              transition: background 0.3s;
            }
            .button:hover {
              background: #764ba2;
            }
            .endpoints {
              background: #f5f5f5;
              padding: 20px;
              border-radius: 6px;
              margin: 20px 0;
              font-family: monospace;
              font-size: 14px;
            }
            .endpoints-title {
              font-weight: bold;
              color: #333;
              margin-bottom: 10px;
            }
            .endpoint {
              padding: 8px 0;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚀 Apollo Sandbox</h1>
            <p>Welcome to the SWII Microservices Apollo Gateway!</p>
            <p>Apollo Sandbox is a GraphQL IDE where you can:</p>
            <ul style="color: #666;">
              <li>Explore the federated schema</li>
              <li>Write and test GraphQL queries and mutations</li>
              <li>See real-time documentation</li>
              <li>Debug API issues</li>
            </ul>

            <div class="endpoints">
              <div class="endpoints-title">Available Services:</div>
              <div class="endpoint">• despacho: http://localhost:8001/graphql</div>
              <div style="padding: 8px 0; color: #999; font-size: 12px;">Other services can be enabled via ENABLED_SERVICES env var</div>
            </div>

            <a href="https://studio.apollographql.com/?endpoint=http://localhost:4000/graphql" class="button" target="_blank">
              Open Apollo Sandbox
            </a>

            <p style="font-size: 12px; color: #999; margin-top: 30px;">
              For local testing, you can also use graphql-playground or any GraphQL IDE.
            </p>
          </div>
        </body>
      </html>
    `);
});
/**
 * Initialize Apollo Server - Resilient Startup
 * The gateway will start regardless of service availability
 */
let serverStarted = false;
let schemaReady = false;
let _wsServer;
// Handle Apollo Server startup with graceful error handling
const startupPromise = apolloServer.start()
    .then(() => {
    serverStarted = true;
    schemaReady = true;
    logger.info('[APOLLO SERVER] Started successfully with schema');
})
    .catch((err) => {
    const errorMsg = err.message;
    serverStarted = true; // Mark as started even if schema composition failed
    schemaReady = false; // But mark schema as not ready
    // Log the error but continue
    logger.warn('[APOLLO SERVER] Started but schema composition failed:', errorMsg);
    logger.warn('[APOLLO SERVER] Gateway will serve /health and /metrics endpoints');
    logger.warn('[APOLLO SERVER] Waiting for services to become available...');
    // Return success so we don't stop the startup chain
    return Promise.resolve();
});
startupPromise.then(() => {
    /**
     * GraphQL Endpoint (GET & POST /graphql)
     * Only register if Apollo Server started successfully
     */
    if (schemaReady) {
        // GET handler for queries and introspection
        app.get('/graphql', authenticateRequest, expressMiddleware(apolloServer, {
            context: async ({ req }) => {
                const authReq = req;
                return {
                    authenticated: authReq.auth?.authenticated || false,
                    user: authReq.auth?.user,
                    token: authReq.auth?.token,
                    userId: authReq.auth?.user?.id,
                    tokenType: authReq.auth?.tokenType,
                };
            }
        }));
        // POST handler for mutations and queries
        app.post('/graphql', express.json(), authenticateRequest, expressMiddleware(apolloServer, {
            context: async ({ req }) => {
                const authReq = req;
                return {
                    authenticated: authReq.auth?.authenticated || false,
                    user: authReq.auth?.user,
                    token: authReq.auth?.token,
                    userId: authReq.auth?.user?.id,
                    tokenType: authReq.auth?.tokenType,
                };
            }
        }));
    }
    /**
     * WebSocket Setup for Subscriptions
     */
    _wsServer = new WebSocketServer({
        server: httpServer,
        path: '/graphql',
    });
    /**
     * Schema Endpoint (Development only)
     */
    if (process.env.NODE_ENV !== 'production') {
        app.get('/schema', async (_req, res) => {
            const schema = apolloServer.schema;
            if (schema) {
                try {
                    const { printSchema } = await import('graphql');
                    res.set('Content-Type', 'text/plain');
                    res.send(printSchema(schema));
                }
                catch (error) {
                    logger.error('Error printing schema', error);
                    res.status(500).json({ error: 'Failed to print schema' });
                }
            }
            else {
                res.status(503).json({ error: 'Schema not yet available' });
            }
        });
        /**
         * Authentication Cache Stats (Development only)
         */
        app.get('/auth/cache-stats', (_req, res) => {
            const stats = getCacheStats();
            res.json({
                cacheSize: stats.size,
                entries: stats.entries.length,
                details: stats.entries.slice(0, 5), // Show first 5
            });
        });
    }
    /**
     * Error Handling for 404
     */
    app.use((_req, res) => {
        res.status(404).json({
            error: 'Not Found',
            path: _req.path,
            method: _req.method,
        });
    });
    /**
     * Global Error Handler
     */
    app.use((err, _req, res, _next) => {
        logger.error('Unhandled error', err);
        res.status(500).json({
            error: 'Internal Server Error',
            message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
        });
    });
    /**
     * Start HTTP Server
     */
    const port = GATEWAY_CONFIG.port;
    httpServer.listen(port, () => {
        logger.info(`
╔════════════════════════════════════════╗
║   Apollo Gateway Server Started        ║
╠════════════════════════════════════════╣
║ URL:      http://localhost:${port}/graphql      ║
║ Health:   http://localhost:${port}/health        ║
║ Status:   http://localhost:${port}/status        ║
╚════════════════════════════════════════╝
    `);
        logger.info(`Registered Subgraphs:`);
        SUBGRAPH_CONFIG.forEach(config => {
            logger.info(`  • ${config.name}: ${config.url}`);
        });
    });
    /**
     * Graceful Shutdown
     */
    process.on('SIGTERM', async () => {
        logger.info('SIGTERM received, shutting down gracefully...');
        _wsServer.close();
        await apolloServer.stop();
        httpServer.close(() => {
            logger.info('Server closed');
            process.exit(0);
        });
        // Force shutdown after 10 seconds
        setTimeout(() => {
            logger.error('Forced shutdown', new Error('Timeout'));
            process.exit(1);
        }, 10000);
    });
    process.on('SIGINT', async () => {
        logger.info('SIGINT received, shutting down gracefully...');
        _wsServer.close();
        await apolloServer.stop();
        httpServer.close(() => {
            logger.info('Server closed');
            process.exit(0);
        });
    });
}).catch(err => {
    const errorMsg = err.message;
    console.error('\n╔════════════════════════════════════════╗');
    console.error('║     STARTUP ERROR (Resilient Mode)     ║');
    console.error('╚════════════════════════════════════════╝\n');
    console.error(err);
    console.error('\n');
    logger.error('Error during Apollo Gateway startup', err);
    // In resilient mode, we log the error but may continue
    // Service health will be monitored via /health/detailed endpoint
    logger.warn('Gateway is starting in resilient mode. Services will be discovered as they become available.');
    // For critical Apollo Server errors, we still exit
    if (errorMsg.includes('FATAL') || errorMsg.includes('CRITICAL')) {
        logger.error('Critical error detected - exiting');
        process.exit(1);
    }
    // Otherwise, allow the process to continue (server may be listening but with no schema)
});
export default app;
//# sourceMappingURL=server.js.map