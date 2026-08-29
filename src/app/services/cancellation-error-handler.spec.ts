import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorHandler } from '@angular/core';
import { CancellationErrorHandler } from './cancellation-error-handler';

/** Builds the sentinel exactly as Monaco does. */
function canceled(): Error {
  const err = new Error('Canceled');
  err.name = 'Canceled';
  return err;
}

describe('CancellationErrorHandler', () => {
  let handler: CancellationErrorHandler;
  let delegate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // The handler delegates to a plain ErrorHandler; spy on the prototype so
    // the assertion is about delegation, not about console output.
    delegate = vi.spyOn(ErrorHandler.prototype, 'handleError').mockImplementation(() => {});
    handler = new CancellationErrorHandler();
  });

  afterEach(() => {
    delegate.mockRestore();
  });

  it('drops Monaco cancellation', () => {
    handler.handleError(canceled());
    expect(delegate).not.toHaveBeenCalled();
  });

  it('drops an AbortError carrying the same message', () => {
    const err = new Error('Canceled');
    err.name = 'AbortError';
    handler.handleError(err);
    expect(delegate).not.toHaveBeenCalled();
  });

  it('drops cancellation wrapped as a cause', () => {
    const wrapper = new Error('request failed', { cause: canceled() });
    handler.handleError(wrapper);
    expect(delegate).not.toHaveBeenCalled();
  });

  // The whole risk of this handler is swallowing something real, so the
  // near-misses matter more than the hit.
  it('passes through a real error', () => {
    const err = new TypeError('x is not a function');
    handler.handleError(err);
    expect(delegate).toHaveBeenCalledWith(err);
  });

  it('passes through an error merely named Canceled', () => {
    // Name matches, message does not — not the sentinel.
    const err = new Error('Request to /Users was canceled by the server');
    err.name = 'Canceled';
    handler.handleError(err);
    expect(delegate).toHaveBeenCalledWith(err);
  });

  it('passes through an error merely messaged Canceled', () => {
    const err = new Error('Canceled');
    err.name = 'HttpErrorResponse';
    handler.handleError(err);
    expect(delegate).toHaveBeenCalledWith(err);
  });

  it('passes through non-Error values', () => {
    handler.handleError('Canceled');
    expect(delegate).toHaveBeenCalledWith('Canceled');
  });

  it('passes through null', () => {
    handler.handleError(null);
    expect(delegate).toHaveBeenCalledWith(null);
  });
});
