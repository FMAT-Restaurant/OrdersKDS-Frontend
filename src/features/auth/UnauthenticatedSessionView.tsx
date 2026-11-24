/**
 * @file Fallback screen rendered in production builds when no Auth Shell session is present.
 * @satisfies RNF-03, DEF-E5-018
 */

export default function UnauthenticatedSessionView() {
  return (
    <div
      className="orders-kds-root flex min-h-screen w-full items-center justify-center bg-canvas p-6 text-ink"
      data-testid="auth-required-screen"
      role="alert"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-300 bg-surface p-6 text-center shadow-sm">
        <h1 className="text-xl font-bold tracking-tight">Sesión requerida</h1>
        <p className="mt-2 text-sm text-slate-600">
          Inicia sesión desde el portal principal de autenticación para acceder a Órdenes y Cocina
          (KDS).
        </p>
      </div>
    </div>
  );
}
