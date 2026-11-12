/**
 * Authentication and authorization types matching the Auth Shell session contract.
 *
 * Requirements: RNF-03, Guidelines §5.7, ADR-0011.
 */

export const UserRole = {
  WAITER: 'waiter',
  KITCHEN: 'kitchen',
  CHEF: 'chef',
  ADMIN: 'admin',
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];

export interface AuthContext {
  userId: string;
  role: UserRole;
}

/** Function provided by the Auth Shell to retrieve the current valid JWT. */
export type TokenProvider = () => Promise<string | null>;

/**
 * User representation provided by the Auth Shell session contract.
 */
export interface ShellUser {
  id?: string;
  sub?: string;
  email?: string;
  staffId?: string;
  userType?: string;
  roles?: string[];
  permissions?: string[];
  mustChangePassword?: boolean;
}

/**
 * Props passed by the Auth Shell (Host) to federated modules.
 */
export interface FederatedModuleProps {
  token?: string;
  tokenProvider?: TokenProvider;
  currentUser?: ShellUser;
  theme?: 'light' | 'dark';
}

/**
 * Normalize role strings issued by Auth-Backend or development tokens.
 */
export function normalizeShellRole(roleStr?: string): UserRole | undefined {
  if (!roleStr) return undefined;
  const lower = roleStr.toLowerCase().trim();
  if (lower === 'admin' || lower === 'administrador') return UserRole.ADMIN;
  if (lower === 'chef' || lower === 'chef_master') return UserRole.CHEF;
  if (lower === 'kitchen' || lower === 'cocinero') return UserRole.KITCHEN;
  if (lower === 'waiter' || lower === 'mesero') return UserRole.WAITER;
  return undefined;
}

/**
 * Resolve the highest-priority internal UserRole from a ShellUser object.
 */
export function resolveUserRole(user?: ShellUser | null): UserRole | undefined {
  if (!user) return undefined;
  if (user.userType === 'ADMIN' || user.permissions?.includes('*')) return UserRole.ADMIN;

  const roles = user.roles ?? [];
  for (const r of roles) {
    if (normalizeShellRole(r) === UserRole.ADMIN) return UserRole.ADMIN;
  }
  for (const r of roles) {
    if (normalizeShellRole(r) === UserRole.CHEF) return UserRole.CHEF;
  }
  for (const r of roles) {
    if (normalizeShellRole(r) === UserRole.KITCHEN) return UserRole.KITCHEN;
  }
  for (const r of roles) {
    if (normalizeShellRole(r) === UserRole.WAITER) return UserRole.WAITER;
  }

  // Fallback check on PBAC permissions
  if (user.permissions?.some((p) => p === 'kitchen:orders:void_error')) return UserRole.CHEF;
  if (user.permissions?.some((p) => p.startsWith('kitchen:'))) return UserRole.KITCHEN;
  if (user.permissions?.some((p) => p.startsWith('orders:'))) return UserRole.WAITER;

  return undefined;
}

/**
 * Retrieve user session stored in localStorage by the Auth Shell.
 */
export function getStoredSessionUser(): ShellUser | null {
  try {
    const raw = localStorage.getItem('fmat_restaurant_auth_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.user ?? null;
  } catch {
    return null;
  }
}
