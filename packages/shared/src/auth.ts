import { Role } from "./roles";
import { Permission } from "./permissions";

/**
 * User minimal partagé
 * (⚠️ PAS de password ici)
 */
export interface SharedAuthUser {
  id: string;
  email: string;
  role: Role;
  permissions: Permission[];
}
