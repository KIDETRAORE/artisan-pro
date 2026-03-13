// apps/backend/src/services/accountingConnector.factory.ts
import { HttpError } from "../utils/httpError";
import type { AccountingConnector } from "./connectors/accountingConnector.types";
import {
  OdooConnector,
  type OdooConnectorConfig,
} from "./connectors/odoo.connector";
import {
  PennylaneConnector,
  type PennylaneConnectorConfig,
} from "../integrations/providers/pennylane/pennylane.connector";

export type SageConnectorConfig = Record<string, unknown>;
export type QuickbooksConnectorConfig = Record<string, unknown>;

export type AccountingConnectorFactoryInput =
  | {
      provider: "odoo";
      config: OdooConnectorConfig;
    }
  | {
      provider: "pennylane";
      config: PennylaneConnectorConfig;
    }
  | {
      provider: "sage";
      config: SageConnectorConfig;
    }
  | {
      provider: "quickbooks";
      config: QuickbooksConnectorConfig;
    };

export class AccountingConnectorFactory {
  static create(
    input: AccountingConnectorFactoryInput
  ): AccountingConnector {
    switch (input.provider) {
      case "odoo":
        return new OdooConnector(input.config);

      case "pennylane":
        return new PennylaneConnector(input.config);

      case "sage":
        throw new HttpError(
          400,
          "Sage accounting connector is not implemented yet"
        );

      case "quickbooks":
        throw new HttpError(
          400,
          "QuickBooks accounting connector is not implemented yet"
        );

      default:
        throw new HttpError(
          400,
          `Unsupported accounting provider: ${String(
            (input as { provider?: unknown }).provider ?? "unknown"
          )}`
        );
    }
  }
}