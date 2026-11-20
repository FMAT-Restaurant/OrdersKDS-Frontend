import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import KdsApp from '../../src/KdsApp';
import { queryClient } from '../../src/shared/api/queryClient';
import { server } from '../mocks/server';

describe('KdsApp', () => {
  beforeAll(() => server.listen());
  beforeEach(() => {
    queryClient.clear();
  });
  afterEach(() => {
    server.resetHandlers();
    queryClient.clear();
    vi.unstubAllEnvs();
  });
  afterAll(() => server.close());

  it('renders successfully', () => {
    render(<KdsApp />);
    expect(screen.getByText('KDS App')).toBeInTheDocument();
  });

  it('requests /kds/queue against the default gateway URL when tokenProvider is passed without client', async () => {
    vi.stubEnv('VITE_API_URL', '');
    vi.stubEnv('VITE_API_BASE_URL', '');
    const requestedUrls: string[] = [];

    server.use(
      http.get('*/kds/queue', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json([]);
      }),
    );

    render(<KdsApp tokenProvider={async () => 'docker-test-token'} />);

    await waitFor(() => {
      expect(requestedUrls.length).toBeGreaterThan(0);
    });
    expect(requestedUrls[0]).toBe('http://localhost:8000/api/v1/orders/kds/queue?view=active');
  });

  it('forwards explicit apiBaseUrl prop to KdsBoard queue requests', async () => {
    const requestedUrls: string[] = [];

    server.use(
      http.get('*/api/v1/kitchen/kds/queue', ({ request }) => {
        requestedUrls.push(request.url);
        return HttpResponse.json([]);
      }),
    );

    render(
      <KdsApp
        tokenProvider={async () => 'gateway-test-token'}
        apiBaseUrl="http://gateway.local:8000/api/v1/kitchen"
      />,
    );

    await waitFor(() => {
      expect(requestedUrls.length).toBeGreaterThan(0);
    });
    expect(requestedUrls[0]).toBe(
      'http://gateway.local:8000/api/v1/kitchen/kds/queue?view=active',
    );
  });
});
