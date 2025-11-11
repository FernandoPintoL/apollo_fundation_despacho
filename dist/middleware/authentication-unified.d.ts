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
import { Request, Response } from 'express';
export interface AuthUser {
    id: string | number;
    email: string;
    nombre?: string;
    role?: string;
    roles?: string[];
    permissions?: string[];
}
export interface AuthenticatedRequest extends Request {
    auth?: {
        authenticated: boolean;
        user?: AuthUser;
        token?: string;
        tokenType?: 'sanctum' | 'jwt';
    };
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
export declare function authenticateRequest(req: AuthenticatedRequest, _res: Response, next: Function): Promise<void>;
/**
 * Middleware that requires authentication
 *
 * Returns 401 if not authenticated
 *
 * Usage:
 * app.use('/protected', requireAuth, handler);
 */
export declare function requireAuth(req: AuthenticatedRequest, res: Response, next: Function): void;
/**
 * Middleware that requires specific role
 *
 * Usage:
 * app.use('/admin', requireRole(['ADMIN']), handler);
 */
export declare function requireRole(allowedRoles: string[]): (req: AuthenticatedRequest, res: Response, next: Function) => void;
/**
 * Clear authentication cache (for token revocation scenarios)
 *
 * Usage:
 * After logout, call clearTokenCache(token) to force revalidation
 */
export declare function clearTokenCache(token: string): void;
/**
 * Get cache statistics (for monitoring)
 */
export declare function getCacheStats(): {
    size: number;
    entries: Array<{
        key: string;
        expiresIn: number;
    }>;
};
/**
 * Clean expired cache entries (call periodically)
 */
export declare function cleanExpiredCache(): number;
declare const _default: {
    authenticateRequest: typeof authenticateRequest;
    requireAuth: typeof requireAuth;
    requireRole: typeof requireRole;
    clearTokenCache: typeof clearTokenCache;
    getCacheStats: typeof getCacheStats;
    cleanExpiredCache: typeof cleanExpiredCache;
};
export default _default;
//# sourceMappingURL=authentication-unified.d.ts.map