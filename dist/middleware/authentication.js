/**
 * Authentication Middleware
 * Validates JWT tokens and attaches user context to requests
 */
import jwt from 'jsonwebtoken';
import { JWT_CONFIG } from '../config/subgraphs.js';
import { logger } from '../utils/logger.js';
/**
 * Extract token from Authorization header
 */
const extractToken = (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return null;
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        return null;
    }
    return parts[1];
};
/**
 * Verify and decode JWT token
 */
const verifyToken = (token) => {
    try {
        const decoded = jwt.verify(token, JWT_CONFIG.secret);
        return decoded;
    }
    catch (error) {
        logger.debug('Token verification failed', { error: error.message });
        return null;
    }
};
/**
 * Authentication middleware for Express
 * Validates JWT tokens and builds context
 */
export const authenticateRequest = (req, _res, next) => {
    const token = extractToken(req);
    if (!token) {
        logger.debug('No token provided in request', {
            path: req.path,
            method: req.method,
        });
        // It's OK to not have a token for some queries
        // We'll just set authenticated to false
        req.auth = {
            authenticated: false,
        };
        return next();
    }
    const decoded = verifyToken(token);
    if (!decoded) {
        logger.warn('Invalid token attempted', {
            path: req.path,
            method: req.method,
        });
        req.auth = {
            authenticated: false,
            error: 'Invalid or expired token',
        };
        return next();
    }
    logger.debug('Token validated successfully', {
        userId: decoded.userId || decoded.sub,
        email: decoded.email,
    });
    req.auth = {
        authenticated: true,
        token,
        user: {
            id: decoded.userId || decoded.sub || decoded.id,
            email: decoded.email,
            roles: decoded.roles || [],
            permissions: decoded.permissions || [],
        },
    };
    next();
};
/**
 * Require authentication middleware
 * Returns 401 if not authenticated
 */
export const requireAuth = (req, res, next) => {
    if (!req.auth?.authenticated) {
        logger.warn('Unauthorized access attempt', {
            path: req.path,
            method: req.method,
        });
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Valid authentication token required',
        });
        return;
    }
    next();
};
/**
 * Role-based access control middleware
 */
export const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.auth?.authenticated) {
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required',
            });
            return;
        }
        const userRoles = req.auth.user?.roles || [];
        const hasRole = allowedRoles.some((role) => userRoles.includes(role));
        if (!hasRole) {
            logger.warn('Forbidden access attempt', {
                userId: req.auth.user?.id,
                requiredRoles: allowedRoles,
                userRoles,
                path: req.path,
            });
            res.status(403).json({
                error: 'Forbidden',
                message: 'Insufficient permissions',
            });
            return;
        }
        next();
    };
};
//# sourceMappingURL=authentication.js.map