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
  displayName?: string;
  firstName?: string;
  lastName?: string;
  roleLabel?: string;
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

const ROLE_PRIORITY: readonly UserRole[] = [
  UserRole.ADMIN,
  UserRole.CHEF,
  UserRole.KITCHEN,
  UserRole.WAITER,
];

function findHighestPriorityRole(roles: readonly string[]): UserRole | undefined {
  const normalized = new Set<UserRole>();
  for (const rawRole of roles) {
    const resolved = normalizeShellRole(rawRole);
    if (resolved) {
      normalized.add(resolved);
    }
  }
  return ROLE_PRIORITY.find((candidate) => normalized.has(candidate));
}

function resolveRoleFromPermissions(permissions: readonly string[]): UserRole | undefined {
  if (permissions.includes('kitchen:orders:void_error')) return UserRole.CHEF;
  if (permissions.some((p) => p.startsWith('kitchen:'))) return UserRole.KITCHEN;
  if (permissions.some((p) => p.startsWith('orders:'))) return UserRole.WAITER;
  return undefined;
}

const ADMIN_USER_TYPES = new Set(['ADMIN', 'ADMINISTRADOR']);

function isAdminUserType(userType?: string): boolean {
  return typeof userType === 'string' && ADMIN_USER_TYPES.has(userType.trim().toUpperCase());
}

/**
 * Resolve the highest-priority internal UserRole from a ShellUser object.
 */
export function resolveUserRole(user?: ShellUser | null): UserRole | undefined {
  if (!user) return undefined;
  if (isAdminUserType(user.userType) || user.permissions?.includes('*')) return UserRole.ADMIN;

  if (user.roles) {
    const roleFromRoles = findHighestPriorityRole(user.roles);
    if (roleFromRoles) return roleFromRoles;
  }

  return user.permissions ? resolveRoleFromPermissions(user.permissions) : undefined;
}

/**
 * Determine whether a ShellUser holds administrative privileges.
 */
export function isAdminUser(user?: ShellUser | null): boolean {
  if (!user) return false;
  return Boolean(
    isAdminUserType(user.userType) ||
      user.permissions?.includes('*') ||
      user.roles?.some((r) => normalizeShellRole(r) === UserRole.ADMIN),
  );
}

/**
 * Evaluate RBAC/PBAC permission strings formatted as `module:resource:action`.
 */
export function hasPermission(
  user: ShellUser | null | undefined,
  requiredPermission: string,
): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  return Boolean(user.permissions?.includes(requiredPermission));
}

/**
 * Determine whether a ShellUser should access the Kitchen (KDS) module.
 */
export function hasKitchenModuleAccess(user?: ShellUser | null): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  if (user.permissions?.some((p) => p.startsWith('kitchen:'))) return true;
  return Boolean(
    user.roles?.some((r) => {
      const role = normalizeShellRole(r);
      return role === UserRole.CHEF || role === UserRole.KITCHEN;
    }),
  );
}

/**
 * Determine whether a ShellUser should access the Waiter/Orders module.
 * CHEF_MASTER carries `orders:orders:view` to inspect ticket details without
 * unlocking full waiter order-management navigation.
 */
export function hasWaiterModuleAccess(user?: ShellUser | null): boolean {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  if (user.roles?.some((r) => normalizeShellRole(r) === UserRole.WAITER)) return true;
  if (user.permissions?.some((p) => p.startsWith('orders:') && p !== 'orders:orders:view')) {
    return true;
  }
  return Boolean(
    user.permissions?.includes('orders:orders:view') && !hasKitchenModuleAccess(user),
  );
}

/**
 * Determine whether the caller can manually open or close operational shifts.
 * Strictly restricted to Master Chef (CHEF / CHEF_MASTER) and Admin.
 */
export function canManageShifts(
  user?: ShellUser | null,
  fallbackRole?: UserRole,
): boolean {
  if (user) {
    if (isAdminUser(user)) return true;
    if (Array.isArray(user.permissions)) {
      return (
        user.permissions.includes('*') ||
        user.permissions.includes('kitchen:shifts:manage') ||
        user.permissions.includes('kitchen:orders:void_error')
      );
    }
    return Boolean(
      user.roles?.some((rawRole) => {
        const role = normalizeShellRole(rawRole);
        return role === UserRole.CHEF || role === UserRole.ADMIN;
      }),
    );
  }
  return fallbackRole === UserRole.CHEF || fallbackRole === UserRole.ADMIN;
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
