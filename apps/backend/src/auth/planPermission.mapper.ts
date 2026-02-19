import { PERMISSIONS, type Permission } from "@auth/permissions";

export function getPermissionsFromPlan(
  plan: string | null
): Permission[] {
  switch (plan) {
    case "pro":
      return [
        PERMISSIONS.ACCESS_DASHBOARD,
        PERMISSIONS.USE_VISION,
      ];

    case "admin":
      return Object.values(PERMISSIONS);

    case "free":
    default:
      return [PERMISSIONS.ACCESS_DASHBOARD];
  }
}
