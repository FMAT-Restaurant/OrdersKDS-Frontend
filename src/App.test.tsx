import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom';
import App from './App';

expect.extend(matchers);

describe('App component', () => {
  it('renders correctly with heading and counter button', () => {
    render(<App />);

    const headingElement = screen.getByRole('heading', { level: 1, name: /get started/i });
    (expect(headingElement) as any).toBeInTheDocument();

    const buttonElement = screen.getByRole('button', { name: /count is 0/i });
    (expect(buttonElement) as any).toBeInTheDocument();
  });

  it('increments counter on click', () => {
    render(<App />);
    const button = screen.getByRole('button', { name: /count is/i });
    fireEvent.click(button);
    (expect(button) as any).toHaveTextContent(/count is 1/i);
  });
});

