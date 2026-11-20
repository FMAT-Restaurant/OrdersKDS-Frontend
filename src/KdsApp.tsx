import { KdsBoard } from './features/kds-board/KdsBoard.tsx';
import type { ApiClient } from './shared/api/client.ts';
import type { Order } from './shared/api/schemas.ts';
import type { ShellUser, TokenProvider, UserRole } from './shared/types/auth.ts';

export interface KdsAppProps {
  readonly userRole?: UserRole;
  readonly currentUser?: ShellUser | null;
  readonly tokenProvider?: TokenProvider;
  readonly apiBaseUrl?: string;
  readonly client?: ApiClient;
  readonly onAdminVoid?: (order: Order) => void;
  readonly onChefVoid?: (order: Order) => void;
}

export default function KdsApp({
  userRole,
  currentUser,
  tokenProvider,
  apiBaseUrl,
  client,
  onAdminVoid,
  onChefVoid,
}: Readonly<KdsAppProps> = {}) {
  return (
    <div className="orders-kds-root w-screen h-screen">
      <h1 className="sr-only">KDS App</h1>
      <KdsBoard
        userRole={userRole}
        currentUser={currentUser}
        tokenProvider={tokenProvider}
        apiBaseUrl={apiBaseUrl}
        client={client}
        onAdminVoid={onAdminVoid}
        onChefVoid={onChefVoid}
      />
    </div>
  );
}
