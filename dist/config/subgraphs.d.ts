/**
 * Subgraph Configuration
 * Define all microservices that will be part of the Apollo Federation
 */
export interface SubgraphConfig {
    name: string;
    url: string;
    timeout?: number;
    retries?: number;
}
export declare const SUBGRAPH_CONFIG: SubgraphConfig[];
/**
 * Gateway Configuration
 */
export declare const GATEWAY_CONFIG: {
    port: number;
    nodeEnv: string;
    debug: boolean;
    introspectionPollInterval: number;
    compositionTimeoutMs: number;
};
/**
 * CORS Configuration
 */
export declare const CORS_CONFIG: {
    origin: string;
    credentials: boolean;
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
};
/**
 * Rate Limiting Configuration
 */
export declare const RATE_LIMIT_CONFIG: {
    windowMs: number;
    maxRequests: number;
};
/**
 * JWT Configuration
 */
export declare const JWT_CONFIG: {
    secret: string;
    expiresIn: string;
};
/**
 * Health Check Configuration
 */
export declare const HEALTH_CHECK_CONFIG: {
    interval: number;
    serviceTimeout: number;
};
declare const _default: {
    SUBGRAPH_CONFIG: SubgraphConfig[];
    GATEWAY_CONFIG: {
        port: number;
        nodeEnv: string;
        debug: boolean;
        introspectionPollInterval: number;
        compositionTimeoutMs: number;
    };
    CORS_CONFIG: {
        origin: string;
        credentials: boolean;
        methods: string[];
        allowedHeaders: string[];
        exposedHeaders: string[];
    };
    RATE_LIMIT_CONFIG: {
        windowMs: number;
        maxRequests: number;
    };
    JWT_CONFIG: {
        secret: string;
        expiresIn: string;
    };
    HEALTH_CHECK_CONFIG: {
        interval: number;
        serviceTimeout: number;
    };
};
export default _default;
//# sourceMappingURL=subgraphs.d.ts.map