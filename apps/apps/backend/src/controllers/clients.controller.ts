// apps/backend/src/controllers/clients.controller.ts
import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../utils/httpError";
import { requireUser } from "../utils/requireUser";
import { ClientsService } from "../services/clients.service";

const ClientIdSchema = z.string().uuid();

export class ClientsController {
  /**
   * POST /clients
   * Crée un client (minimal)
   */
  static async create(req: Request, res: Response) {
    const user = requireUser(req);

    const client = await ClientsService.createClient(user.id, req.body);

    return res.status(201).json({
      success: true,
      client,
    });
  }

  /**
   * GET /clients
   * Liste des clients de l'utilisateur
   */
  static async list(req: Request, res: Response) {
    const user = requireUser(req);

    const clients = await ClientsService.listClients(user.id);

    return res.status(200).json({
      success: true,
      clients,
    });
  }

  /**
   * GET /clients/:clientId
   * Détail d'un client
   */
  static async getOne(req: Request, res: Response) {
    const user = requireUser(req);

    const clientId = ClientIdSchema.safeParse(req.params.clientId);
    if (!clientId.success) {
      throw new HttpError(400, "Invalid clientId");
    }

    const client = await ClientsService.getClient(user.id, clientId.data);

    return res.status(200).json({
      success: true,
      client,
    });
  }

  /**
   * PATCH /clients/:clientId
   * Mise à jour client
   */
  static async update(req: Request, res: Response) {
    const user = requireUser(req);

    const clientId = ClientIdSchema.safeParse(req.params.clientId);
    if (!clientId.success) {
      throw new HttpError(400, "Invalid clientId");
    }

    const client = await ClientsService.updateClient(user.id, clientId.data, req.body);

    return res.status(200).json({
      success: true,
      client,
    });
  }
}