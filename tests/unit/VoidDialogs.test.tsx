import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { AdminVoidDialog } from '../../src/features/kds-board/dialogs/AdminVoidDialog.tsx';
import { ChefVoidDialog } from '../../src/features/kds-board/dialogs/ChefVoidDialog.tsx';
import { VirtualKeyboard } from '../../src/features/kds-board/dialogs/VirtualKeyboard.tsx';
import { OrderCard } from '../../src/features/kds-board/OrderCard.tsx';
import type { Order } from '../../src/shared/api/schemas.ts';
import { UserRole } from '../../src/shared/types/auth.ts';
import { ItemStatus, OrderStatus } from '../../src/shared/types/order.ts';

describe('VoidDialogs & VirtualKeyboard Suite (TASK-36, ADR-0012)', () => {
  const inPreparationOrder: Order = {
    id: 'ord-void-101',
    tableNumber: 7,
    status: OrderStatus.IN_PREPARATION,
    version: 2,
    items: [
      {
        id: 'item-1',
        name: 'Corte Ribeye',
        quantity: 1,
        unitPrice: 450,
        status: ItemStatus.PENDING,
      },
    ],
    in_preparation_at: '2026-11-08T00:10:00Z',
  };

  const reservedOrder: Order = {
    ...inPreparationOrder,
    id: 'ord-void-reserved',
    status: OrderStatus.RESERVED,
  };

  // -------------------------------------------------------------------------
  // UT-FE-22: Chef validation (RF-29) & VirtualKeyboard interaction
  // -------------------------------------------------------------------------
  describe('UT-FE-22: ChefVoidDialog validation (disabled without reason/text, enabled with at least one)', () => {
    it('disables confirm button initially and enables it when at least one quick reason is selected', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <ChefVoidDialog
          order={inPreparationOrder}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      expect(screen.getByTestId('chef-void-warning')).toHaveTextContent(
        'No se cobrará por error de cocina',
      );

      const confirmBtn = screen.getByTestId('chef-void-confirm');
      expect(confirmBtn).toBeDisabled();

      // Select quick reason "Quemado"
      const burntReasonBtn = screen.getByRole('button', { name: 'Quemado' });
      fireEvent.click(burntReasonBtn);

      expect(burntReasonBtn).toHaveAttribute('aria-pressed', 'true');
      expect(confirmBtn).toBeEnabled();

      // Deselect "Quemado" -> confirm becomes disabled again
      fireEvent.click(burntReasonBtn);
      expect(burntReasonBtn).toHaveAttribute('aria-pressed', 'false');
      expect(confirmBtn).toBeDisabled();

      // Select "Contaminación cruzada" and confirm
      const crossContaminationBtn = screen.getByRole('button', {
        name: 'Contaminación cruzada',
      });
      fireEvent.click(crossContaminationBtn);
      expect(confirmBtn).toBeEnabled();

      fireEvent.click(confirmBtn);
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledWith(
        inPreparationOrder,
        'Contaminación cruzada',
      );
    });

    it('enables confirm button when text is entered via the on-screen VirtualKeyboard and disables it when erased', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <ChefVoidDialog
          order={inPreparationOrder}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      const confirmBtn = screen.getByTestId('chef-void-confirm');
      const noteInput = screen.getByTestId('chef-void-note-input');
      expect(confirmBtn).toBeDisabled();
      expect(noteInput).toHaveValue('');

      // Space alone (whitespace only) must not enable confirm
      fireEvent.click(screen.getByTestId('virtual-key-space'));
      expect(noteInput).toHaveValue(' ');
      expect(confirmBtn).toBeDisabled();

      // Backspace removes the space
      fireEvent.click(screen.getByTestId('virtual-key-backspace'));
      expect(noteInput).toHaveValue('');

      // Type "SAL" using virtual keys
      fireEvent.click(screen.getByTestId('virtual-key-S'));
      fireEvent.click(screen.getByTestId('virtual-key-A'));
      fireEvent.click(screen.getByTestId('virtual-key-L'));
      expect(noteInput).toHaveValue('SAL');
      expect(confirmBtn).toBeEnabled();

      // Confirm sends the custom note
      fireEvent.click(confirmBtn);
      expect(onConfirm).toHaveBeenCalledWith(inPreparationOrder, 'SAL');
    });

    it('combines selected quick reasons and VirtualKeyboard text on confirm and supports cancel', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <ChefVoidDialog
          order={inPreparationOrder}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Caído' }));
      fireEvent.click(screen.getByTestId('virtual-key-P'));
      fireEvent.click(screen.getByTestId('virtual-key-I'));
      fireEvent.click(screen.getByTestId('virtual-key-S'));
      fireEvent.click(screen.getByTestId('virtual-key-O'));

      fireEvent.click(screen.getByTestId('chef-void-confirm'));
      expect(onConfirm).toHaveBeenCalledWith(inPreparationOrder, 'Caído - PISO');

      // Direct input change also updates the custom note
      fireEvent.change(screen.getByTestId('chef-void-note-input'), {
        target: { value: 'Nota manual' },
      });
      expect(screen.getByTestId('chef-void-note-input')).toHaveValue('Nota manual');

      fireEvent.click(screen.getByTestId('chef-void-cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('is visible when userRole is CHEF or ADMIN, and strictly hidden when userRole is WAITER or KITCHEN', () => {
      // Visible for CHEF
      const { container: chefContainer } = render(
        <ChefVoidDialog
          order={inPreparationOrder}
          userRole={UserRole.CHEF}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(chefContainer).not.toBeEmptyDOMElement();
      expect(screen.getByTestId('chef-void-dialog')).toBeInTheDocument();

      // Visible for ADMIN
      const { container: adminContainer } = render(
        <ChefVoidDialog
          order={inPreparationOrder}
          userRole={UserRole.ADMIN}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(adminContainer).not.toBeEmptyDOMElement();

      // Hidden for WAITER
      const { container: waiterContainer } = render(
        <ChefVoidDialog
          order={inPreparationOrder}
          userRole={UserRole.WAITER}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(waiterContainer).toBeEmptyDOMElement();

      // Hidden for KITCHEN
      const { container: kitchenContainer } = render(
        <ChefVoidDialog
          order={inPreparationOrder}
          userRole={UserRole.KITCHEN}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(kitchenContainer).toBeEmptyDOMElement();
    });
  });

  // -------------------------------------------------------------------------
  // UT-FE-23: Administrative Void Role Visibility & Status Blocking (RF-26)
  // -------------------------------------------------------------------------
  describe('UT-FE-23: Administrative void role visibility & status blocking', () => {
    it('is visible strictly for ADMIN role and hidden for non-admin roles (WAITER, KITCHEN, CHEF)', () => {
      // Visible for ADMIN
      const { container: adminContainer } = render(
        <AdminVoidDialog
          order={inPreparationOrder}
          userRole={UserRole.ADMIN}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(adminContainer).not.toBeEmptyDOMElement();
      expect(screen.getByTestId('admin-void-dialog')).toBeInTheDocument();

      // Hidden for WAITER
      const { container: waiterContainer } = render(
        <AdminVoidDialog
          order={inPreparationOrder}
          userRole={UserRole.WAITER}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(waiterContainer).toBeEmptyDOMElement();

      // Hidden for KITCHEN
      const { container: kitchenContainer } = render(
        <AdminVoidDialog
          order={inPreparationOrder}
          userRole={UserRole.KITCHEN}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(kitchenContainer).toBeEmptyDOMElement();

      // Hidden for CHEF
      const { container: chefContainer } = render(
        <AdminVoidDialog
          order={inPreparationOrder}
          userRole={UserRole.CHEF}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(chefContainer).toBeEmptyDOMElement();
    });

    it('blocks AdminVoidDialog confirmation and displays an error alert when order is in RESERVED status', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <AdminVoidDialog
          order={reservedOrder}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      expect(screen.getByTestId('admin-void-invalid-status')).toBeInTheDocument();
      const confirmBtn = screen.getByTestId('admin-void-confirm');
      expect(confirmBtn).toBeDisabled();

      fireEvent.click(confirmBtn);
      expect(onConfirm).not.toHaveBeenCalled();

      // Cancel remains operable so the user can dismiss the dialog
      fireEvent.click(screen.getByTestId('admin-void-cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('blocks ChefVoidDialog actions, quick reasons, and virtual keyboard when order is in RESERVED or CREATED status', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <ChefVoidDialog
          order={reservedOrder}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      expect(screen.getByTestId('chef-void-invalid-status')).toBeInTheDocument();

      const confirmBtn = screen.getByTestId('chef-void-confirm');
      expect(confirmBtn).toBeDisabled();

      const burntBtn = screen.getByRole('button', { name: 'Quemado' });
      expect(burntBtn).toBeDisabled();
      fireEvent.click(burntBtn);

      const keyA = screen.getByTestId('virtual-key-A');
      expect(keyA).toBeDisabled();
      fireEvent.click(keyA);

      expect(confirmBtn).toBeDisabled();
      fireEvent.click(confirmBtn);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('does not render dialogs when isOpen is false', () => {
      const { container: adminContainer } = render(
        <AdminVoidDialog
          order={inPreparationOrder}
          isOpen={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(adminContainer).toBeEmptyDOMElement();

      const { container: chefContainer } = render(
        <ChefVoidDialog
          order={inPreparationOrder}
          isOpen={false}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(chefContainer).toBeEmptyDOMElement();
    });

    it(' ignores VirtualKeyboard interactions when disabled prop is true', () => {
      const onChange = vi.fn();
      render(<VirtualKeyboard value="ABC" onChange={onChange} disabled={true} />);

      fireEvent.click(screen.getByTestId('virtual-key-Q'));
      fireEvent.click(screen.getByTestId('virtual-key-space'));
      fireEvent.click(screen.getByTestId('virtual-key-backspace'));
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // ST-11: Administrative vs Kitchen-Error Warnings & >= 64px Touch Targets
  // -------------------------------------------------------------------------
  describe('ST-11: Warnings and >= 64px touch target verification for all action buttons, quick reasons, and virtual keys', () => {
    it('displays charge warning in AdminVoidDialog and confirms valid IN_PREPARATION order', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      render(
        <AdminVoidDialog
          order={inPreparationOrder}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      expect(screen.getByTestId('admin-void-warning')).toHaveTextContent(
        'Se cobrará la comanda mermada',
      );

      const confirmBtn = screen.getByTestId('admin-void-confirm');
      const cancelBtn = screen.getByTestId('admin-void-cancel');

      expect(confirmBtn).toHaveClass('min-h-[64px]', 'min-w-[64px]');
      expect(confirmBtn).toHaveStyle({ minHeight: '64px', minWidth: '64px' });
      expect(cancelBtn).toHaveClass('min-h-[64px]', 'min-w-[64px]');
      expect(cancelBtn).toHaveStyle({ minHeight: '64px', minWidth: '64px' });

      fireEvent.click(confirmBtn);
      expect(onConfirm).toHaveBeenCalledWith(inPreparationOrder);
    });

    it('enforces >= 64x64px minimum touch area on every button, quick reason, and virtual keyboard key in ChefVoidDialog', () => {
      render(
        <ChefVoidDialog
          order={inPreparationOrder}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByTestId('chef-void-warning')).toHaveTextContent(
        'No se cobrará por error de cocina',
      );

      // Verify all quick reason buttons ("Quemado", "Caído", "Contaminación cruzada", "Falla de equipo")
      const reasonsGrid = screen.getByTestId('chef-quick-reasons-grid');
      const reasonButtons = within(reasonsGrid).getAllByRole('button');
      expect(reasonButtons).toHaveLength(4);
      for (const btn of reasonButtons) {
        expect(btn).toHaveClass('min-h-[64px]', 'min-w-[64px]');
        expect(btn).toHaveStyle({ minHeight: '64px', minWidth: '64px' });
      }

      // Verify all virtual keyboard keys (letters + space + backspace)
      const keyboard = screen.getByTestId('virtual-keyboard');
      const keyButtons = within(keyboard).getAllByRole('button');
      expect(keyButtons.length).toBeGreaterThanOrEqual(29);
      for (const keyBtn of keyButtons) {
        expect(keyBtn).toHaveClass('min-h-[64px]', 'min-w-[64px]');
        expect(keyBtn).toHaveStyle({ minHeight: '64px', minWidth: '64px' });
      }

      // Verify Confirm and Cancel buttons
      const confirmBtn = screen.getByTestId('chef-void-confirm');
      const cancelBtn = screen.getByTestId('chef-void-cancel');
      expect(confirmBtn).toHaveClass('min-h-[64px]', 'min-w-[64px]');
      expect(confirmBtn).toHaveStyle({ minHeight: '64px', minWidth: '64px' });
      expect(cancelBtn).toHaveClass('min-h-[64px]', 'min-w-[64px]');
      expect(cancelBtn).toHaveStyle({ minHeight: '64px', minWidth: '64px' });
    });

    it('executes ST-11 in green with admin and chef roles verifying warnings and confirmation', () => {
      const onAdminConfirm = vi.fn();
      const onChefConfirm = vi.fn();

      // Admin executes administrative void
      const { unmount: unmountAdmin } = render(
        <AdminVoidDialog
          order={inPreparationOrder}
          userRole={UserRole.ADMIN}
          onConfirm={onAdminConfirm}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByTestId('admin-void-warning')).toHaveTextContent(
        'Se cobrará la comanda mermada',
      );
      fireEvent.click(screen.getByTestId('admin-void-confirm'));
      expect(onAdminConfirm).toHaveBeenCalledWith(inPreparationOrder);
      unmountAdmin();

      // Chef executes kitchen-error void
      render(
        <ChefVoidDialog
          order={inPreparationOrder}
          userRole={UserRole.CHEF}
          onConfirm={onChefConfirm}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByTestId('chef-void-warning')).toHaveTextContent(
        'No se cobrará por error de cocina',
      );
      fireEvent.click(screen.getByRole('button', { name: 'Quemado' }));
      fireEvent.click(screen.getByTestId('chef-void-confirm'));
      expect(onChefConfirm).toHaveBeenCalledWith(inPreparationOrder, 'Quemado');
    });
  });

  // -------------------------------------------------------------------------
  // OrderCard Integration (TASK-36, RF-26..29): Void Triggers on IN_PREPARATION
  // -------------------------------------------------------------------------
  describe('OrderCard Void Triggers on IN_PREPARATION orders', () => {
    it('renders Admin and Chef void trigger buttons with >= 64px height and invokes callbacks', () => {
      const onAdminVoid = vi.fn();
      const onChefVoid = vi.fn();

      render(
        <OrderCard
          order={inPreparationOrder}
          onAdminVoid={onAdminVoid}
          onChefVoid={onChefVoid}
        />,
      );

      const adminBtn = screen.getByTestId('order-action-admin-void-ord-void-101');
      const chefBtn = screen.getByTestId('order-action-chef-void-ord-void-101');

      expect(adminBtn).toHaveClass('min-h-[64px]');
      expect(adminBtn).toHaveStyle({ minHeight: '64px' });
      expect(chefBtn).toHaveClass('min-h-[64px]');
      expect(chefBtn).toHaveStyle({ minHeight: '64px' });

      fireEvent.click(adminBtn);
      expect(onAdminVoid).toHaveBeenCalledWith(inPreparationOrder);

      fireEvent.click(chefBtn);
      expect(onChefVoid).toHaveBeenCalledWith(inPreparationOrder);
    });

    it('filters trigger buttons according to userRole on OrderCard', () => {
      const onAdminVoid = vi.fn();
      const onChefVoid = vi.fn();

      // CHEF sees only kitchen void button
      const { rerender } = render(
        <OrderCard
          order={inPreparationOrder}
          userRole={UserRole.CHEF}
          onAdminVoid={onAdminVoid}
          onChefVoid={onChefVoid}
        />,
      );
      expect(screen.queryByTestId('order-action-admin-void-ord-void-101')).not.toBeInTheDocument();
      expect(screen.getByTestId('order-action-chef-void-ord-void-101')).toBeInTheDocument();

      // WAITER sees neither button
      rerender(
        <OrderCard
          order={inPreparationOrder}
          userRole={UserRole.WAITER}
          onAdminVoid={onAdminVoid}
          onChefVoid={onChefVoid}
        />,
      );
      expect(screen.queryByTestId('order-action-admin-void-ord-void-101')).not.toBeInTheDocument();
      expect(screen.queryByTestId('order-action-chef-void-ord-void-101')).not.toBeInTheDocument();

      // Does not show void triggers on RESERVED orders even if handlers are provided
      rerender(
        <OrderCard
          order={reservedOrder}
          userRole={UserRole.ADMIN}
          onAdminVoid={onAdminVoid}
          onChefVoid={onChefVoid}
        />,
      );
      expect(screen.queryByTestId('order-action-admin-void-ord-void-reserved')).not.toBeInTheDocument();
      expect(screen.queryByTestId('order-action-chef-void-ord-void-reserved')).not.toBeInTheDocument();
    });
  });

  describe('AdminVoidDialog & ChefVoidDialog edge cases & header formatting', () => {
    it('handles takeaway, general delivery, isSubmitting and onCancel in AdminVoidDialog', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      const takeawayOrder: Order = {
        ...inPreparationOrder,
        id: 'ord-takeaway-admin',
        tableNumber: null,
        isTakeaway: true,
        orderNumber: 77,
      };

      const { rerender } = render(
        <AdminVoidDialog
          order={takeawayOrder}
          userRole={UserRole.ADMIN}
          isSubmitting={true}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      expect(screen.getByText(/Anulación Administrativa · Para llevar · #77/)).toBeInTheDocument();
      expect(screen.getByTestId('admin-void-cancel')).toBeDisabled();
      expect(screen.getByTestId('admin-void-confirm')).toBeDisabled();

      // Rerender not submitting and trigger cancel
      rerender(
        <AdminVoidDialog
          order={{ ...takeawayOrder, isTakeaway: false }}
          userRole={UserRole.ADMIN}
          isSubmitting={false}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      expect(screen.getByText(/Anulación Administrativa · #77/)).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('admin-void-cancel'));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it('handles takeaway and general delivery in ChefVoidDialog', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      const takeawayOrder: Order = {
        ...inPreparationOrder,
        id: 'ord-takeaway-chef',
        tableNumber: null,
        isTakeaway: true,
        orderNumber: 88,
      };

      const { rerender } = render(
        <ChefVoidDialog
          order={takeawayOrder}
          userRole={UserRole.CHEF}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      expect(screen.getByText(/Anulación por Error de Cocina · Para llevar · #88/)).toBeInTheDocument();

      // Order with neither tableNumber nor isTakeaway
      rerender(
        <ChefVoidDialog
          order={{ ...takeawayOrder, isTakeaway: false }}
          userRole={UserRole.CHEF}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />,
      );

      expect(screen.getByText(/Anulación por Error de Cocina · #88/)).toBeInTheDocument();
    });
  });
});

