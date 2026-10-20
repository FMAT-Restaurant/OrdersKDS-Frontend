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
