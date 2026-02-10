import "express";

/**
 * ================================
 * Extension des types Express
 * ================================
 * Permet d'accéder à req.user
 * dans tout le backend sans `any`
 */

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      tokenVersion?: number;
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
