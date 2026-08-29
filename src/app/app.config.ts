import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideMonacoEditor } from 'ngx-monaco-editor-v2';

import { routes } from './app.routes';
import { CancellationErrorHandler } from './services/cancellation-error-handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Monaco reports abandoned validation work as a rejected promise; the
    // global listener above would otherwise log it on every schema swap.
    { provide: ErrorHandler, useClass: CancellationErrorHandler },
    provideRouter(routes),
    // Monaco backs the Explorer's request-body editor. Charts are drawn in
    // CSS from the summaries the backend already returns, so no chart library
    // is registered.
    provideMonacoEditor({ baseUrl: 'assets/monaco/vs' }),
  ]
};
