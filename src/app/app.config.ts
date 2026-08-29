import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideMonacoEditor } from 'ngx-monaco-editor-v2';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Monaco backs the Explorer's request-body editor. Charts are drawn in
    // CSS from the summaries the backend already returns, so no chart library
    // is registered.
    provideMonacoEditor({ baseUrl: 'assets/monaco/vs' }),
  ]
};
