import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import OrderTicketWidget from '../../src/OrderTicketWidget';

describe('OrderTicketWidget', () => {
  it('renders successfully', () => {
    render(<OrderTicketWidget />);
    expect(screen.getByText(/Order Ticket widget/i)).toBeInTheDocument();
  });
});
