import { Request, Response, NextFunction } from "express";
import { SubscriptionService } from "../services/subscription.service";

export const subscriptionMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    await SubscriptionService.checkAccess(req.user.id);

    next();
  } catch (error) {
    next(error);
  }
};
