/**
 * Unified Authentication Middleware
 * Supports both Sanctum (Laravel) and JWT tokens
 *
 * Features:
 * - Detects token type (Sanctum vs JWT)
 * - Validates Sanctum tokens against MS Autentificación
 * - Validates JWT tokens locally
 * - Caches Sanctum validation for performance
 * - Graceful error handling
 */
import axios from 'axios';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
const tokenCache = new Map();
const CACHE_TTL_SECONDS = 300; // 5 minutes
/**
 * Get JWT secret from environment
 */
function getJWTSecret() {
    const secret = process.env.JWT_SECRET || 'change-me-in-production';
    if (secret === 'change-me-in-production' && process.env.NODE_ENV === 'production') {
        logger.warn('JWT_SECRET is using default value in production!');
    }
    return secret;
}
/**
 * Extract Bearer token from Authorization header
 */
function extractToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return null;
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        logger.debug(`Invalid Authorization header format: ${parts[0]}`);
        return null;
    }
    return parts[1];
}
/**
 * Detect token type based on format
 * Sanctum: "1|abc123xyz" (contains pipe |)
 * JWT: "eyJhbGciOiJIUzI1NiIs..." (base64 encoded)
 */
function detectTokenType(token) {
    return token.includes('|') ? 'sanctum' : 'jwt';
}
/**
 * Create cache key for Sanctum token validation
 */
function getCacheKey(token) {
    return `token:${crypto.createHash('md5').update(token).digest('hex')}`;
}
/**
 * Get cached validation result if still valid
 */
function getCachedValidation(token) {
    const cacheKey = getCacheKey(token);
    const cached = tokenCache.get(cacheKey);
    if (!cached) {
        return null;
    }
    if (Date.now() > cached.expiresAt) {
        tokenCache.delete(cacheKey);
        return null;
    }
    logger.debug(`Token validation cache hit for token: ${token.substring(0, 10)}...`);
    return cached.userData;
}
/**
 * Store validation result in cache
 */
function cacheValidation(token, userData) {
    const cacheKey = getCacheKey(token);
    const expiresAt = Date.now() + (CACHE_TTL_SECONDS * 1000);
    tokenCache.set(cacheKey, { userData, expiresAt });
    logger.debug(`Cached token validation for ${CACHE_TTL_SECONDS}s`);
}
/**
 * Validate Sanctum token against MS Autentificación
 *
 * Makes GraphQL query to validate token:
 * query { validateToken(token: "...") { id email nombre role } }
 */
async function validateSanctumToken(req, token) {
    // Check cache first
    const cachedUser = getCachedValidation(token);
    if (cachedUser) {
        req.auth = {
            authenticated: true,
            user: cachedUser,
            token,
            tokenType: 'sanctum',
        };
        return;
    }
    try {
        const authServiceUrl = process.env.MS_AUTENTIFICACION_URL || 'http://localhost:8000/graphql';
        logger.debug(`Validating Sanctum token against ${authServiceUrl}`);
        const response = await axios.post(authServiceUrl, {
            query: `
          query {
            validateToken(token: "${token}") {
              id
              email
              nombre
              role
            }
          }
        `,
        }, {
            timeout: parseInt(process.env.MS_AUTH_TIMEOUT || '5000', 10),
            headers: {
                'Content-Type': 'application/json',
            },
        });
        // Check for GraphQL errors
        if (response.data?.errors) {
            logger.warn(`GraphQL error validating token: ${response.data.errors[0].message}`);
            throw new Error('Token validation failed');
        }
        const userData = response.data?.data?.validateToken;
        if (!userData || !userData.id) {
            logger.warn('Token validation returned no user data');
            throw new Error('Invalid token');
        }
        // Cache the validation result
        cacheValidation(token, userData);
        // Set auth context
        req.auth = {
            authenticated: true,
            user: userData,
            token,
            tokenType: 'sanctum',
        };
        logger.debug(`Sanctum token validated for user: ${userData.email}`);
    }
    catch (error) {
        const axiosError = error;
        if (axiosError.code === 'ECONNREFUSED') {
            logger.error('MS Autentificación service is unreachable');
        }
        else if (axiosError.code === 'ECONNABORTED') {
            logger.error('MS Autentificación request timeout');
        }
        else {
            logger.error(`Sanctum token validation failed: ${error}`);
        }
        throw new Error('Failed to validate Sanctum token');
    }
}
/**
 * Validate JWT token locally
 *
 * Expected payload:
 * {
 *   userId: string,
 *   email: string,
 *   nombre?: string,
 *   role?: string,
 *   roles?: string[],
 *   permissions?: string[]
 * }
 */
function validateJWTToken(req, token) {
    try {
        const secret = getJWTSecret();
        const decoded = jwt.verify(token, secret);
        logger.debug(`JWT token validated for user: ${decoded.email}`);
        req.auth = {
            authenticated: true,
            user: {
                id: decoded.userId || decoded.sub || decoded.id,
                email: decoded.email,
                nombre: decoded.nombre,
                role: decoded.role,
                roles: decoded.roles,
                permissions: decoded.permissions,
            },
            token,
            tokenType: 'jwt',
        };
    }
    catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            logger.warn(`JWT token expired: ${error.message}`);
            throw new Error('Token expired');
        }
        else if (error instanceof jwt.JsonWebTokenError) {
            logger.warn(`Invalid JWT token: ${error.message}`);
            throw new Error('Invalid token');
        }
        else {
            logger.error(`JWT validation error: ${error}`);
            throw new Error('Token validation failed');
        }
    }
}
/**
 * Main authentication middleware
 *
 * Features:
 * - Optional authentication (continues without token)
 * - Detects and validates both Sanctum and JWT tokens
 * - Provides auth context to request
 * - Caches Sanctum validations
 * - Comprehensive error logging
 *
 * Usage:
 * app.use('/graphql', authenticateRequest, expressMiddleware(apolloServer));
 */
export async function authenticateRequest(req, _res, next) {
    // Initialize auth context
    req.auth = { authenticated: false };
    const token = extractToken(req);
    if (!token) {
        logger.debug('No token provided in request');
        next();
        return;
    }
    try {
        const tokenType = detectTokenType(token);
        logger.debug(`Processing ${tokenType} token: ${token.substring(0, 20)}...`);
        if (tokenType === 'sanctum') {
            await validateSanctumToken(req, token);
        }
        else {
            validateJWTToken(req, token);
        }
        logger.info(`Authentication successful for user: ${req.auth.user?.email} (${req.auth.tokenType})`);
    }
    catch (error) {
        logger.warn(`Authentication failed: ${error}`);
        req.auth = { authenticated: false };
    }
    next();
}
/**
 * Middleware that requires authentication
 *
 * Returns 401 if not authenticated
 *
 * Usage:
 * app.use('/protected', requireAuth, handler);
 */
export function requireAuth(req, res, next) {
    if (!req.auth?.authenticated) {
        logger.warn('Unauthorized access attempt');
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required',
        });
        return;
    }
    next();
}
/**
 * Middleware that requires specific role
 *
 * Usage:
 * app.use('/admin', requireRole(['ADMIN']), handler);
 */
export function requireRole(allowedRoles) {
    return (req, res, next) => {
        if (!req.auth?.authenticated) {
            logger.warn('Unauthorized access attempt (not authenticated)');
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required',
            });
            return;
        }
        const userRole = req.auth.user?.role || req.auth.user?.roles?.[0];
        if (!userRole || !allowedRoles.includes(userRole)) {
            logger.warn(`Forbidden access attempt: user role "${userRole}" not in allowed roles: ${allowedRoles.join(', ')}`);
            res.status(403).json({
                error: 'Forbidden',
                message: 'Insufficient permissions',
            });
            return;
        }
        next();
    };
}
/**
 * Clear authentication cache (for token revocation scenarios)
 *
 * Usage:
 * After logout, call clearTokenCache(token) to force revalidation
 */
export function clearTokenCache(token) {
    const cacheKey = getCacheKey(token);
    tokenCache.delete(cacheKey);
    logger.debug(`Cleared cache for token: ${token.substring(0, 10)}...`);
}
/**
 * Get cache statistics (for monitoring)
 */
export function getCacheStats() {
    const entries = Array.from(tokenCache.entries()).map(([key, value]) => ({
        key,
        expiresIn: Math.max(0, value.expiresAt - Date.now()),
    }));
    return {
        size: tokenCache.size,
        entries,
    };
}
/**
 * Clean expired cache entries (call periodically)
 */
export function cleanExpiredCache() {
    let cleaned = 0;
    const now = Date.now();
    for (const [key, value] of tokenCache.entries()) {
        if (now > value.expiresAt) {
            tokenCache.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        logger.debug(`Cleaned ${cleaned} expired cache entries`);
    }
    return cleaned;
}
// Clean expired cache every 5 minutes
setInterval(() => {
    cleanExpiredCache();
}, 5 * 60 * 1000);
export default {
    authenticateRequest,
    requireAuth,
    requireRole,
    clearTokenCache,
    getCacheStats,
    cleanExpiredCache,
};
//# sourceMappingURL=authentication-unified.js.map