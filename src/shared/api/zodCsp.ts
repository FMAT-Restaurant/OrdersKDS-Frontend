import { z } from 'zod';

/**
 * Disable Zod v4 JIT code generation (`new Function`) so strict production CSP
 * (`script-src 'self'` without `'unsafe-eval'`) never fires a `securitypolicyviolation`.
 */
z.config({ jitless: true });

export { z };
