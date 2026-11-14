import { KdsBoard } from './features/kds-board/KdsBoard.tsx';
import type { ApiClient } from './shared/api/client.ts';
import type { Order } from './shared/api/schemas.ts';
import type { TokenProvider, UserRole } from './shared/types/auth.ts';

export interface KdsAppProps {
  readonly userRole?: UserRole;
  readonly tokenProvider?: TokenProvider;
  readonly client?: ApiClient;
  readonly onAdminVoid?: (order: Order) => void;
  readonly onChefVoid?: (order: Order) => void;
}

export default function KdsApp({
  userRole,
  tokenProvider,
  client,
  onAdminVoid,
  onChefVoid,
}: Readonly<KdsAppProps> = {}) {
  return (
    <div className="orders-kds-root w-screen h-screen">
      <h1 className="sr-only">KDS App</h1>
      <KdsBoard
        userRole={userRole}
        tokenProvider={tokenProvider}
        client={client}
        onAdminVoid={onAdminVoid}
        onChefVoid={onChefVoid}
      />
    </div>
  );
}
