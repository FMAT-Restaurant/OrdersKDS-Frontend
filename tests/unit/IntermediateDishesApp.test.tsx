import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import IntermediateDishesApp from '../../src/IntermediateDishesApp';

describe('IntermediateDishesApp', () => {
  it('renders successfully', () => {
    render(<IntermediateDishesApp />);
    expect(screen.getByText('Intermediate Dishes App')).toBeInTheDocument();
  });
});
