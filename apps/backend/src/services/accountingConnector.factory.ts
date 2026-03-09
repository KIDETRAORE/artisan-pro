// apps/backend/src/services/accountingConnector.factory.ts
import { HttpError } from "../utils/httpError";
import type {
  AccountingConnector,
  AccountingProvider,
} from "./connectors/accountingConnector.types";
import { PennylaneConnector } from "../integrations/providers/pennylane/pennylane.connector";
import {
  OdooConnector,
  type OdooConnectorConfig,
} from "./connectors/odoo.connector";

type PennylaneConnectorConfig = unknown;

export type AccountingConnectorFactoryInput =
  | {
      provider: "pennylane";
      config?: PennylaneConnectorConfig;
    }
  | {
      provider: "odoo";
      config: OdooConnectorConfig;
    };

export class AccountingConnectorFactory {
  static create(
    input: AccountingConnectorFactoryInput
  ): AccountingConnector {
    switch (input.provider) {
      case "pennylane":
        return new PennylaneConnector() as unknown as AccountingConnector;

      case "odoo":
        return new OdooConnector(input.config);

      default: {
        const provider = (input as { provider?: AccountingProvider }).provider;
        throw new HttpError(
          400,
          `Unsupported accounting provider: ${String(provider ?? "unknown")}`
        );
      }
    }
  }
}