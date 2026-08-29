import { ErrorHandler, Injectable, inject } from '@angular/core';

/**
 * True for the sentinel Monaco throws when it abandons in-flight work.
 *
 * Monaco creates these with `new Error('Canceled')` and `name = 'Canceled'`,
 * and filters them internally with its own `isCancellationError`. The same
 * check is used here, deliberately narrow: an error only qualifies if BOTH the
 * name and the message say so, so nothing an actual failure produces can slip
 * through on a coincidental name.
 */
function isCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const name = error.name;
  return (name === 'Canceled' || name === 'AbortError') && error.message === 'Canceled';
}

/**
 * Swallows Monaco's cancellation sentinel; delegates everything else.
 *
 * Switching the Explorer's editor between the user / group / patchop models is
 * what routes each operation to the right JSON schema. Each switch detaches a
 * model whose validation request is still in flight, and Monaco cancels it —
 * expected control flow, not a fault. The rejection is unhandled inside
 * Monaco's bundle, so `provideBrowserGlobalErrorListeners()` picks it up and
 * logs "ERROR Canceled: Canceled" on every schema swap.
 *
 * Only that sentinel is dropped. Every other error, including anything else
 * thrown from Monaco, still reaches Angular's default handler.
 */
@Injectable()
export class CancellationErrorHandler implements ErrorHandler {
  private readonly delegate = new ErrorHandler();

  handleError(error: unknown): void {
    if (isCancellation(error)) return;

    // Rejections arrive wrapped; check the cause the same way.
    if (error instanceof Error && isCancellation(error.cause)) return;

    this.delegate.handleError(error);
  }
}
