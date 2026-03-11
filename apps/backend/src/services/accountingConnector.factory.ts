// apps/backend/src/services/accountingConnector.factory.ts
import { HttpError } from "../utils/httpError";
import type {
  AccountingConnector,
  AccountingProvider,
} from "./connectors/accountingConnector.types";
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
        throw new HttpError(
          400,
          "Pennylane accounting sync connector is not implemented yet"
        );

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