import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import KdsApp from '../../src/KdsApp';

describe('KdsApp', () => {
  it('renders successfully', () => {
    render(<KdsApp />);
    expect(screen.getByText('KDS App')).toBeInTheDocument();
  });
});
