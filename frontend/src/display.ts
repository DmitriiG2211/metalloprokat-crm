import { User } from "./types";

type ManagerLike = Pick<User, "login" | "role" | "full_name" | "manager_number">;

const leaderRoles = new Set(["admin", "director", "senior_manager"]);

export function userDisplayName(user?: Partial<ManagerLike> | null) {
  if (!user) return "-";
  if (user.role && leaderRoles.has(user.role)) return "Руководитель";
  if (user.manager_number) return `Менеджер ${user.manager_number}`;
  return user.login || user.full_name || "-";
}

export function managerDisplayName(user?: Partial<ManagerLike> | null) {
  if (!user) return "-";
  if (user.manager_number) return `Менеджер ${user.manager_number}`;
  return user.login || user.full_name || "-";
}
