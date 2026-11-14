import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RedoItemDialog } from '../../src/features/order-ticket/RedoItemDialog.tsx';

describe('RedoItemDialog (TASK-23, UT-FE-21)', () => {
  // -------------------------------------------------------------------------
  // UT-FE-21: Diálogo de rehechura (Redo Dialog) - Validación de nota obligatoria
  // -------------------------------------------------------------------------
  it('disables confirm button initially and with whitespace, enables when text is provided', () => {
    render(
      <RedoItemDialog
        itemName="Corte Ribeye"
        isPending={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const submitButton = screen.getByRole('button', { name: 'Rehacer' });
    const noteInput = screen.getByRole('textbox', { name: /Motivo/ });

    // Initially disabled (DoD: confirmar bloqueado sin texto)
    expect(submitButton).toBeDisabled();

    // Disabled with only whitespace
    fireEvent.change(noteInput, { target: { value: '   \n  ' } });
    expect(submitButton).toBeDisabled();

    // Enabled with at least 1 non-whitespace character
    fireEvent.change(noteInput, { target: { value: 'Término incorrecto' } });
    expect(submitButton).toBeEnabled();

    // Disabled again if cleared
    fireEvent.change(noteInput, { target: { value: '' } });
    expect(submitButton).toBeDisabled();
  });

  it('submits a trimmed note and displays a rejected request error', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Servicio no disponible.'));
    render(
      <RedoItemDialog
        itemName="Sopa"
        isPending={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: /Motivo/ }), {
      target: { value: '  Llegó frío  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rehacer' }));

    expect(onSubmit).toHaveBeenCalledWith('Llegó frío');
    expect(await screen.findByRole('alert')).toHaveTextContent('Servicio no disponible.');
  });

  it('shows a fallback error when the request rejects with a non-Error value', async () => {
    const onSubmit = vi.fn().mockRejectedValue('unknown failure');
    render(
      <RedoItemDialog
        itemName="Sopa"
        isPending={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: /Motivo/ }), {
      target: { value: 'Mala cocción' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rehacer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo solicitar la rehechura del platillo.',
    );
  });

  it('closes on Escape or backdrop click and ignores Escape while submitting', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <RedoItemDialog
        itemName="Sopa"
        isPending={false}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.mouseDown(screen.getByTestId('redo-item-dialog-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(
      <RedoItemDialog
        itemName="Sopa"
        isPending
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus());
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.mouseDown(screen.getByTestId('redo-item-dialog-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('traps keyboard focus within the dialog, including while all controls are disabled', async () => {
    const { rerender } = render(
      <RedoItemDialog
        itemName="Sopa"
        isPending={false}
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const noteInput = screen.getByRole('textbox', { name: /Motivo/ });
    const cancelButton = screen.getByRole('button', { name: 'Cancelar' });
    const submitButton = screen.getByRole('button', { name: 'Rehacer' });
    fireEvent.change(noteInput, { target: { value: 'Mala cocción' } });

    fireEvent.keyDown(noteInput, { key: 'Tab', shiftKey: true });
    expect(submitButton).toHaveFocus();
    fireEvent.keyDown(submitButton, { key: 'Tab' });
    expect(noteInput).toHaveFocus();

    rerender(
      <RedoItemDialog
        itemName="Sopa"
        isPending
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog).toHaveFocus());
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(dialog).toHaveFocus();
    expect(cancelButton).toBeDisabled();
    expect(submitButton).toBeDisabled();
  });
});
