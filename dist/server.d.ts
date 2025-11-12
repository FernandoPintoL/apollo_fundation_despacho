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
import './load-env.js';
/**
 * Initialize Express Application
 */
declare const app: import("express-serve-static-core").Express;
export default app;
//# sourceMappingURL=server.d.ts.map