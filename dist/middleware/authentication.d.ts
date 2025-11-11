/**
 * Authentication Middleware
 * Validates JWT tokens and attaches user context to requests
 */
import { Request, Response, NextFunction } from 'express';
export interface AuthContext {
    authenticated: boolean;
    user?: {
        id: string;
        email: string;
        roles: string[];
        permissions: string[];
    };
    token?: string;
    error?: string;
}
export interface AuthenticatedRequest extends Request {
    auth?: AuthContext;
}
/**
 * Authentication middleware for Express
 * Validates JWT tokens and builds context
 */
export declare const authenticateRequest: (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void;
/**
 * Require authentication middleware
 * Returns 401 if not authenticated
 */
export declare const requireAuth: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
/**
 * Role-based access control middleware
 */
export declare const requireRole: (allowedRoles: string[]) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
//# sourceMappingURL=authentication.d.ts.map