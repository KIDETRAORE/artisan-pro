import { PERMISSIONS, type Permission } from "@auth/permissions";

export function getPermissionsFromPlan(plan: string | null): Permission[] {
  switch (plan) {
    case "pro":
      return [
        PERMISSIONS.ACCESS_DASHBOARD,

        // ✅ base business
        PERMISSIONS.CLIENTS_READ,
        PERMISSIONS.CLIENTS_WRITE,
        PERMISSIONS.INVOICES_READ,
        PERMISSIONS.INVOICES_WRITE,

        // ✅ features pro
        PERMISSIONS.USE_VISION,
      ];

    case "admin":
      return Object.values(PERMISSIONS);

    case "free":
    default:
      return [
        PERMISSIONS.ACCESS_DASHBOARD,

        // ✅ base business (même en free)
        PERMISSIONS.CLIENTS_READ,
        PERMISSIONS.CLIENTS_WRITE,
        PERMISSIONS.INVOICES_READ,
        PERMISSIONS.INVOICES_WRITE,
      ];
  }
}