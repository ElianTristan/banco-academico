export const roleHomes = { alumno: "/alumno", docente: "/docente", administrador: "/admin" } as const;
export type AppRole = keyof typeof roleHomes;

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && value in roleHomes;
}
