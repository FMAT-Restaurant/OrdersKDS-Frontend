import { setupServer } from 'msw/node';
import { restHandlers } from './handlers/restHandlers.ts';

export const server = setupServer(...restHandlers);
