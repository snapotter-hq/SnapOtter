let pendingInput: HTMLInputElement | null = null;

/**
 * Click a programmatically built file input while it is attached to the
 * document. WebKit can garbage-collect a detached input while the system file
 * chooser is open, and the picked files never reach its change handler.
 * The input is removed again on change or cancel; a browser that fires
 * neither leaves it behind until the next picker opens.
 */
export function openFileInput(input: HTMLInputElement): void {
  pendingInput?.remove();
  pendingInput = input;
  const detach = () => {
    input.remove();
    if (pendingInput === input) pendingInput = null;
  };
  input.addEventListener("change", detach, { once: true });
  input.addEventListener("cancel", detach, { once: true });
  input.hidden = true;
  document.body.appendChild(input);
  input.click();
}
