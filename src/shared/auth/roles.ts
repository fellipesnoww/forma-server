/**
 * Papeis do sistema, do menos ao mais privilegiado.
 * A ordem do array define a hierarquia usada por `hasRole`.
 */
export const ROLES = ['user', 'admin', 'super_user'] as const;

export type Role = (typeof ROLES)[number];

const ROLE_RANK: Record<Role, number> = {
  user: 0,
  admin: 1,
  super_user: 2,
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Autorizacao hierarquica: `super_user` satisfaz `admin`, que satisfaz `user`.
 *
 * Vive fora do `plugins/` de proposito — a Fase 3 precisa da mesma regra em services
 * (ex.: "admin nao altera outro admin"), onde nao ha request HTTP.
 */
export function hasRole(actual: Role, minimum: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[minimum];
}
