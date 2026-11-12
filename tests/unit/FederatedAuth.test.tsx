import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App.tsx';
import {
  getStoredSessionUser,
  normalizeShellRole,
  resolveUserRole,
  UserRole,
  type ShellUser,
} from '../../src/shared/types/auth.ts';
import { getStoredSessionToken } from '../../src/shared/api/client.ts';

// Mock child apps to test App orchestration with federated props
vi.mock('../../src/KdsApp.tsx', () => ({
  default: ({ userRole }: { userRole?: UserRole }) => (
    <div data-testid="mock-kds-app" data-user-role={userRole}>
      KdsApp Screen (Role: {userRole ?? 'none'})
    </div>
  ),
}));

vi.mock('../../src/OrderTicketWidget.tsx', () => ({
  default: ({ userId }: { userId?: string }) => (
    <div data-testid="mock-order-ticket-widget" data-user-id={userId}>
      OrderTicketWidget Screen (User: {userId ?? 'none'})
    </div>
  ),
}));

vi.mock('../../src/ReadyOrdersAlert.tsx', () => ({
  ReadyOrdersAlert: () => <div data-testid="mock-ready-orders-alert">ReadyOrdersAlert</div>,
}));

describe('Federated Auth Contract and Orchestration', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  describe('Role Normalization and Priority Resolution', () => {
    it('normalizes role aliases from Auth-Backend correctly', () => {
      expect(normalizeShellRole('MESERO')).toBe(UserRole.WAITER);
      expect(normalizeShellRole('waiter')).toBe(UserRole.WAITER);
      expect(normalizeShellRole('COCINERO')).toBe(UserRole.KITCHEN);
      expect(normalizeShellRole('kitchen')).toBe(UserRole.KITCHEN);
      expect(normalizeShellRole('CHEF_MASTER')).toBe(UserRole.CHEF);
      expect(normalizeShellRole('chef')).toBe(UserRole.CHEF);
      expect(normalizeShellRole('ADMINISTRADOR')).toBe(UserRole.ADMIN);
      expect(normalizeShellRole('admin')).toBe(UserRole.ADMIN);
      expect(normalizeShellRole('UNKNOWN')).toBeUndefined();
      expect(normalizeShellRole(undefined)).toBeUndefined();
    });

    it('resolves primary UserRole by priority (ADMIN > CHEF > KITCHEN > WAITER)', () => {
      expect(resolveUserRole(null)).toBeUndefined();

      // ADMIN userType overrides everything
      expect(resolveUserRole({ userType: 'ADMIN', permissions: [] })).toBe(UserRole.ADMIN);
      expect(resolveUserRole({ permissions: ['*'] })).toBe(UserRole.ADMIN);

      // Multiple roles: ADMIN > CHEF
      expect(
        resolveUserRole({
          roles: ['MESERO', 'ADMINISTRADOR'],
          permissions: [],
        }),
      ).toBe(UserRole.ADMIN);

      // CHEF > KITCHEN > WAITER
      expect(
        resolveUserRole({
          roles: ['COCINERO', 'CHEF_MASTER', 'MESERO'],
          permissions: [],
        }),
      ).toBe(UserRole.CHEF);

      expect(
        resolveUserRole({
          roles: ['COCINERO', 'MESERO'],
          permissions: [],
        }),
      ).toBe(UserRole.KITCHEN);

      expect(
        resolveUserRole({
          roles: ['MESERO'],
          permissions: [],
        }),
      ).toBe(UserRole.WAITER);

      // Fallback via permissions
      expect(
        resolveUserRole({
          roles: [],
          permissions: ['kitchen:orders:void_error'],
        }),
      ).toBe(UserRole.CHEF);

      expect(
        resolveUserRole({
          roles: [],
          permissions: ['kitchen:queues:view'],
        }),
      ).toBe(UserRole.KITCHEN);

      expect(
        resolveUserRole({
          roles: [],
          permissions: ['orders:orders:create'],
        }),
      ).toBe(UserRole.WAITER);
    });
  });

  describe('Session Storage Fallbacks', () => {
    it('retrieves stored token and user from localStorage when present', () => {
      const mockSession = {
        accessToken: 'mock-stored-jwt',
        user: {
          id: 'user-storage-1',
          roles: ['CHEF_MASTER'],
          permissions: ['kitchen:queues:view'],
        },
      };
      localStorage.setItem('fmat_restaurant_auth_session', JSON.stringify(mockSession));

      expect(getStoredSessionToken()).toBe('mock-stored-jwt');
      expect(getStoredSessionUser()).toEqual(mockSession.user);
    });

    it('gracefully handles missing or malformed localStorage', () => {
      expect(getStoredSessionToken()).toBeNull();
      expect(getStoredSessionUser()).toBeNull();

      localStorage.setItem('fmat_restaurant_auth_session', '{invalid-json');
      expect(getStoredSessionToken()).toBeNull();
      expect(getStoredSessionUser()).toBeNull();
    });
  });

  describe('App View Orchestration with FederatedModuleProps', () => {
    it('renders KdsApp directly when currentUser has kitchen role/permissions', () => {
      const chefUser: ShellUser = {
        id: 'chef-uuid-1',
        roles: ['CHEF_MASTER'],
        permissions: ['kitchen:queues:view', 'kitchen:orders:void_error'],
      };

      render(<App currentUser={chefUser} />);

      expect(screen.getByTestId('mock-kds-app')).toBeInTheDocument();
      expect(screen.getByTestId('mock-kds-app')).toHaveAttribute('data-user-role', 'chef');
      expect(screen.queryByTestId('mock-order-ticket-widget')).not.toBeInTheDocument();
      expect(screen.queryByText('Módulo Órdenes & Cocina')).not.toBeInTheDocument();
    });

    it('renders OrderTicketWidget directly when currentUser has waiter role/permissions', () => {
      const waiterUser: ShellUser = {
        id: 'waiter-uuid-1',
        roles: ['MESERO'],
        permissions: ['orders:orders:view', 'orders:orders:create'],
      };

      render(<App currentUser={waiterUser} />);

      expect(screen.getByTestId('mock-order-ticket-widget')).toBeInTheDocument();
      expect(screen.getByTestId('mock-order-ticket-widget')).toHaveAttribute(
        'data-user-id',
        'waiter-uuid-1',
      );
      expect(screen.queryByTestId('mock-kds-app')).not.toBeInTheDocument();
      expect(screen.queryByText('Módulo Órdenes & Cocina')).not.toBeInTheDocument();
    });

    it('renders tabbed view switcher when currentUser is ADMIN, allowing view toggling', () => {
      const adminUser: ShellUser = {
        id: 'admin-uuid-1',
        userType: 'ADMIN',
        roles: ['ADMINISTRADOR'],
        permissions: ['*'],
      };

      render(<App currentUser={adminUser} />);

      expect(screen.getByText('Módulo Órdenes & Cocina')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pantalla Cocina (KDS)' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Gestión de Comandas' })).toBeInTheDocument();

      // Default view is KDS
      expect(screen.getByTestId('mock-kds-app')).toBeInTheDocument();
      expect(screen.getByTestId('mock-kds-app')).toHaveAttribute('data-user-role', 'admin');

      // Click to toggle to Comandas
      fireEvent.click(screen.getByRole('button', { name: 'Gestión de Comandas' }));
      expect(screen.getByTestId('mock-order-ticket-widget')).toBeInTheDocument();

      // Click back to KDS
      fireEvent.click(screen.getByRole('button', { name: 'Pantalla Cocina (KDS)' }));
      expect(screen.getByTestId('mock-kds-app')).toBeInTheDocument();
    });

    it('applies theme attribute to document element when provided in props', () => {
      render(<App theme="dark" />);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('reads session from localStorage if currentUser prop is not passed', () => {
      const storedSession = {
        accessToken: 'jwt-123',
        user: {
          id: 'stored-waiter',
          roles: ['MESERO'],
          permissions: ['orders:orders:view'],
        },
      };
      localStorage.setItem('fmat_restaurant_auth_session', JSON.stringify(storedSession));

      render(<App />);

      expect(screen.getByTestId('mock-order-ticket-widget')).toBeInTheDocument();
      expect(screen.getByTestId('mock-order-ticket-widget')).toHaveAttribute(
        'data-user-id',
        'stored-waiter',
      );
    });
  });
});

