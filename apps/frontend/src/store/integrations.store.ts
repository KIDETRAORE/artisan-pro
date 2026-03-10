// apps/frontend/src/store/integrations.store.ts
import { create } from "zustand";
import {
  connectOdoo,
  connectPennylane,
  disconnectOdoo,
  disconnectPennylane,
  getOdooStatus,
  getPennylaneStatus,
  syncOdoo,
  syncPennylane,
  type OdooConnection,
  type OdooSyncEvent,
  type PennylaneConnection,
  type PennylaneSyncEvent,
} from "../services/integrations.api";

type IntegrationsStoreState = {
  pennylane: {
    connection: PennylaneConnection | null;
    recentEvents: PennylaneSyncEvent[];
    loading: boolean;
    syncing: boolean;
    connecting: boolean;
    disconnecting: boolean;
    error: string | null;
  };
  odoo: {
    connection: OdooConnection | null;
    recentEvents: OdooSyncEvent[];
    loading: boolean;
    syncing: boolean;
    connecting: boolean;
    disconnecting: boolean;
    error: string | null;
  };

  loadPennylaneStatus: () => Promise<void>;
  connectPennylane: (apiKey: string) => Promise<void>;
  disconnectPennylane: () => Promise<void>;
  syncPennylane: () => Promise<void>;

  loadOdooStatus: () => Promise<void>;
  connectOdoo: (payload: {
    baseUrl: string;
    database: string;
    login: string;
    apiKey: string;
  }) => Promise<void>;
  disconnectOdoo: () => Promise<void>;
  syncOdoo: () => Promise<void>;

  resetErrors: () => void;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Une erreur est survenue.";
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function pollPennylaneStatus(attempts = 4, delayMs = 1000) {
  let latest = await getPennylaneStatus();

  for (let i = 1; i < attempts; i += 1) {
    await wait(delayMs);
    latest = await getPennylaneStatus();
  }

  return latest;
}

async function pollOdooStatus(attempts = 4, delayMs = 1000) {
  let latest = await getOdooStatus();

  for (let i = 1; i < attempts; i += 1) {
    await wait(delayMs);
    latest = await getOdooStatus();
  }

  return latest;
}

export const useIntegrationsStore = create<IntegrationsStoreState>((set) => ({
  pennylane: {
    connection: null,
    recentEvents: [],
    loading: false,
    syncing: false,
    connecting: false,
    disconnecting: false,
    error: null,
  },
  odoo: {
    connection: null,
    recentEvents: [],
    loading: false,
    syncing: false,
    connecting: false,
    disconnecting: false,
    error: null,
  },

  loadPennylaneStatus: async () => {
    set((state) => ({
      pennylane: {
        ...state.pennylane,
        loading: true,
        error: null,
      },
    }));

    try {
      const data = await getPennylaneStatus();

      set((state) => ({
        pennylane: {
          ...state.pennylane,
          connection: data.connection,
          recentEvents: data.recentEvents,
          loading: false,
          error: null,
        },
      }));
    } catch (error) {
      set((state) => ({
        pennylane: {
          ...state.pennylane,
          loading: false,
          error: getErrorMessage(error),
        },
      }));
    }
  },

  connectPennylane: async (apiKey: string) => {
    set((state) => ({
      pennylane: {
        ...state.pennylane,
        connecting: true,
        error: null,
      },
    }));

    try {
      const connection = await connectPennylane(apiKey);
      const refreshed = await getPennylaneStatus();

      set((state) => ({
        pennylane: {
          ...state.pennylane,
          connection,
          recentEvents: refreshed.recentEvents,
          connecting: false,
          error: null,
        },
      }));
    } catch (error) {
      set((state) => ({
        pennylane: {
          ...state.pennylane,
          connecting: false,
          error: getErrorMessage(error),
        },
      }));
      throw error;
    }
  },

  disconnectPennylane: async () => {
    set((state) => ({
      pennylane: {
        ...state.pennylane,
        disconnecting: true,
        error: null,
      },
    }));

    try {
      await disconnectPennylane();

      set((state) => ({
        pennylane: {
          ...state.pennylane,
          connection: {
            provider: "pennylane",
            connected: false,
            status: "disconnected",
            connectedAt: null,
            hasCredential: false,
            usesWorkspaceKey: false,
          },
          recentEvents: [],
          disconnecting: false,
          error: null,
        },
      }));
    } catch (error) {
      set((state) => ({
        pennylane: {
          ...state.pennylane,
          disconnecting: false,
          error: getErrorMessage(error),
        },
      }));
      throw error;
    }
  },

  syncPennylane: async () => {
    set((state) => ({
      pennylane: {
        ...state.pennylane,
        syncing: true,
        error: null,
      },
    }));

    try {
      await syncPennylane();
      const refreshed = await pollPennylaneStatus();

      set((state) => ({
        pennylane: {
          ...state.pennylane,
          connection: refreshed.connection,
          recentEvents: refreshed.recentEvents,
          syncing: false,
          error: null,
        },
      }));
    } catch (error) {
      set((state) => ({
        pennylane: {
          ...state.pennylane,
          syncing: false,
          error: getErrorMessage(error),
        },
      }));
      throw error;
    }
  },

  loadOdooStatus: async () => {
    set((state) => ({
      odoo: {
        ...state.odoo,
        loading: true,
        error: null,
      },
    }));

    try {
      const data = await getOdooStatus();

      set((state) => ({
        odoo: {
          ...state.odoo,
          connection: data.connection,
          recentEvents: data.recentEvents,
          loading: false,
          error: null,
        },
      }));
    } catch (error) {
      set((state) => ({
        odoo: {
          ...state.odoo,
          loading: false,
          error: getErrorMessage(error),
        },
      }));
    }
  },

  connectOdoo: async (payload) => {
    set((state) => ({
      odoo: {
        ...state.odoo,
        connecting: true,
        error: null,
      },
    }));

    try {
      const connection = await connectOdoo(payload);
      const refreshed = await getOdooStatus();

      set((state) => ({
        odoo: {
          ...state.odoo,
          connection,
          recentEvents: refreshed.recentEvents,
          connecting: false,
          error: null,
        },
      }));
    } catch (error) {
      set((state) => ({
        odoo: {
          ...state.odoo,
          connecting: false,
          error: getErrorMessage(error),
        },
      }));
      throw error;
    }
  },

  disconnectOdoo: async () => {
    set((state) => ({
      odoo: {
        ...state.odoo,
        disconnecting: true,
        error: null,
      },
    }));

    try {
      await disconnectOdoo();

      set((state) => ({
        odoo: {
          ...state.odoo,
          connection: {
            provider: "odoo",
            connected: false,
            status: "disconnected",
            connectedAt: null,
            hasCredential: false,
            usesWorkspaceKey: false,
          },
          recentEvents: [],
          disconnecting: false,
          error: null,
        },
      }));
    } catch (error) {
      set((state) => ({
        odoo: {
          ...state.odoo,
          disconnecting: false,
          error: getErrorMessage(error),
        },
      }));
      throw error;
    }
  },

  syncOdoo: async () => {
    set((state) => ({
      odoo: {
        ...state.odoo,
        syncing: true,
        error: null,
      },
    }));

    try {
      await syncOdoo();
      const refreshed = await pollOdooStatus();

      set((state) => ({
        odoo: {
          ...state.odoo,
          connection: refreshed.connection,
          recentEvents: refreshed.recentEvents,
          syncing: false,
          error: null,
        },
      }));
    } catch (error) {
      set((state) => ({
        odoo: {
          ...state.odoo,
          syncing: false,
          error: getErrorMessage(error),
        },
      }));
      throw error;
    }
  },

  resetErrors: () => {
    set((state) => ({
      pennylane: {
        ...state.pennylane,
        error: null,
      },
      odoo: {
        ...state.odoo,
        error: null,
      },
    }));
  },
}));