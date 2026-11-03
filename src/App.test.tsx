import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App component', () => {
  it('renders the KDS board', () => {
    render(<App />);

    const headingElement = screen.getByRole('heading', { level: 1, name: /kds app/i });
    expect(headingElement).toBeInTheDocument();
  });
});
