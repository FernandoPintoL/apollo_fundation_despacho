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
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { ApolloGateway, IntrospectAndCompose, RemoteGraphQLDataSource } from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
// Load environment variables
dotenv.config();
// Import custom modules
import { logger } from './utils/logger.js';
import { SUBGRAPH_CONFIG, GATEWAY_CONFIG, CORS_CONFIG } from './config/subgraphs.js';
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
 * Apollo Gateway Setup with Resilient Startup
 *
 * This configuration:
 * - Tolerates missing services at startup
 * - Continuously polls for service availability
 * - Discovers services dynamically as they come online
 */
// Wrapper for IntrospectAndCompose that logs initialization attempts
const createResilientSupergraphSdl = () => {
    let isInitialized = false;
    const introspectAndCompose = new IntrospectAndCompose({
        subgraphs: SUBGRAPH_CONFIG.map(config => ({
            name: config.name,
            url: config.url,
        })),
        pollIntervalInMs: GATEWAY_CONFIG.introspectionPollInterval,
    });
    return {
        async initialize(opts) {
            try {
                const result = await introspectAndCompose.initialize(opts);
                isInitialized = true;
                logger.info('✓ Apollo Gateway schema initialized successfully');
                return result;
            }
            catch (error) {
                const err = error;
                // Log the error but don't crash on initial startup
                if (!isInitialized) {
                    logger.warn(`⚠ Some services unavailable at startup (will keep retrying): ${err.message}`);
                    // Return empty but valid supergraph to keep gateway running
                    // The polling mechanism will update it once services are available
                    return {
                        supergraphSdl: 'schema { query: Query } type Query { _empty: String }',
                        cleanup: async () => { },
                    };
                }
                // If already initialized, use normal error handling
                throw error;
            }
        },
    };
};
const gateway = new ApolloGateway({
    supergraphSdl: createResilientSupergraphSdl(),
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
 * Initialize Apollo Server with Resilient Error Handling
 */
let serverStarted = false;
apolloServer.start().then(() => {
    serverStarted = true;
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
     * GraphQL Endpoint (GET & POST /graphql)
     */
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
    /**
     * WebSocket Setup for Subscriptions
     */
    // Note: WebSocket subscriptions require additional graphql-ws configuration
    // For now, relying on Apollo Server v4's built-in WebSocket support
    const _wsServer = new WebSocketServer({
        server: httpServer,
        path: '/graphql',
    });
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
            const subgraphStatus = await Promise.all(SUBGRAPH_CONFIG.map(async (config) => {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 5000);
                    const response = await fetch(`${config.url}?query={__schema{types{name}}}`, { signal: controller.signal });
                    clearTimeout(timeoutId);
                    return {
                        name: config.name,
                        url: config.url,
                        status: response.ok ? 'healthy' : 'unhealthy',
                        statusCode: response.status,
                    };
                }
                catch (error) {
                    return {
                        name: config.name,
                        url: config.url,
                        status: 'unreachable',
                        error: error.message,
                    };
                }
            }));
            // Check if gateway has a schema (safely, using any for apollo server internal)
            const apolloServerAny = apolloServer;
            const schemaReady = serverStarted && apolloServerAny._schema !== undefined;
            res.json({
                status: 'ok',
                service: 'apollo-gateway',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                schemaReady,
                subgraphs: subgraphStatus,
                allHealthy: subgraphStatus.every(s => s.status === 'healthy'),
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
     * Start Server
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
    // Check if it's a service connectivity error at startup
    const isServiceError = errorMsg.includes('Couldn\'t load service definitions') ||
        errorMsg.includes('connect ECONNREFUSED') ||
        errorMsg.includes('ENOTFOUND');
    console.error('=== DETAILED ERROR ===');
    console.error(err);
    console.error('====================');
    logger.error('Failed to start Apollo Server', err);
    if (isServiceError && !serverStarted) {
        // Don't exit - let the server continue running and polling for services
        logger.warn('⚠ Service connectivity issue detected at startup. ' +
            'Apollo Gateway will continue running and retry connecting to services. ' +
            'Services will be discovered as they come online.');
    }
    else {
        // For other types of errors, exit
        process.exit(1);
    }
});
export default app;
//# sourceMappingURL=server.js.map