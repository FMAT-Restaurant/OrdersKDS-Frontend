import { KdsBoard } from './features/kds-board/KdsBoard.tsx';

export default function KdsApp() {
  return (
    <div className="orders-kds-root w-screen h-screen">
      <h1 className="sr-only">KDS App</h1>
      <KdsBoard />
    </div>
  );
}
