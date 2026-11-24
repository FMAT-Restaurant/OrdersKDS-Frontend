import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../../src/App.tsx';

describe('App component', () => {
  it('renders the KDS board', async () => {
    render(<App />);

    const headingElement = await screen.findByRole('heading', { level: 1, name: /kds app/i });
    expect(headingElement).toBeInTheDocument();
  });
});
