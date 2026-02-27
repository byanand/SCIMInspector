import { Component, inject, signal, OnInit, computed, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatMenuModule } from '@angular/material/menu';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
import { TauriService } from '../../services/tauri.service';
import { ServerConfigService } from '../../services/server-config.service';
import { NotificationService } from '../../services/notification.service';
import { ThemeService } from '../../services/theme.service';
import { ScimSchemaService } from '../../services/scim-schema.service';
import { SampleData } from '../../models/interfaces';

@Component({
  selector: 'app-sample-data',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatChipsModule,
    MatDividerModule, MatTooltipModule, MatTabsModule, MatProgressSpinnerModule,
    MatMenuModule, MonacoEditorModule
  ],
  templateUrl: './sample-data.component.html',
  styleUrl: './sample-data.component.scss',
})
export class SampleDataComponent implements OnInit, OnDestroy {
  private tauriService = inject(TauriService);
  serverConfigService = inject(ServerConfigService);
  private notificationService = inject(NotificationService);
  private themeService = inject(ThemeService);
  scimSchemaService = inject(ScimSchemaService);

  // Monaco editor options
  editorOptions = computed(() => ({
    theme: this.themeService.darkMode() ? 'vs-dark' : 'vs',
    language: 'json',
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 14,
    lineNumbers: 'on' as const,
    renderLineHighlight: 'all' as const,
    bracketPairColorization: { enabled: true },
    formatOnPaste: true,
    tabSize: 2,
    wordWrap: 'on' as const,
    folding: true,
    glyphMargin: false,
    lineDecorationsWidth: 8,
    padding: { top: 8, bottom: 8 },
  }));

  // Data
  items = signal<SampleData[]>([]);
  loading = signal(false);
  saving = signal(false);

  // Editor
  editingItem = signal<SampleData | null>(null);
  isNew = signal(false);
  editorName = signal('');
  editorType = signal<'user' | 'group'>('user');
  editorJson = signal('');
  jsonError = signal('');
  monacoEditor: any = null;
  private monacoModel: any = null;
  private modelContentListener: any = null;

  onMonacoInit(editor: any) {
    this.monacoEditor = editor;
    // Register global schemas (safe to call multiple times)
    this.scimSchemaService.registerMonacoSchemas();
    // Defer model swap to next tick so Monaco finishes initializing
    // (prevents "Canceled" error from pending internal operations)
    setTimeout(() => this.applyEditorModel(), 0);
  }

  /** Create/swap the Monaco model with a URI that routes to the correct schema. */
  private applyEditorModel(): void {
    if (!this.monacoEditor) return;
    const monaco = (window as any).monaco;
    if (!monaco) return;

    // Dispose previous listener (but keep models alive to avoid cancel errors)
    if (this.modelContentListener) {
      this.modelContentListener.dispose();
      this.modelContentListener = null;
    }

    const type = this.editorType();
    const uriStr = this.scimSchemaService.getModelUri('sample-data', type);
    const uri = monaco.Uri.parse(uriStr);

    // Reuse existing model or create new
    let model = monaco.editor.getModel(uri);
    if (model) {
      model.setValue(this.editorJson());
    } else {
      model = monaco.editor.createModel(this.editorJson(), 'json', uri);
    }

    // Track the previous model so we can dispose it after the swap
    const prevModel = this.monacoModel;
    this.monacoModel = model;
    this.monacoEditor.setModel(model);

    // Dispose old model after new one is active (safe now — no pending ops)
    if (prevModel && prevModel !== model) {
      try { prevModel.dispose(); } catch (_) { /* already disposed */ }
    }

    // Listen for content changes and sync back to signal
    this.modelContentListener = model.onDidChangeContent(() => {
      this.editorJson.set(model.getValue());
    });
  }

  private disposeMonacoModel(): void {
    if (this.modelContentListener) {
      this.modelContentListener.dispose();
      this.modelContentListener = null;
    }
    if (this.monacoModel) {
      try { this.monacoModel.dispose(); } catch (_) { /* already disposed */ }
      this.monacoModel = null;
    }
  }

  // Filtered views
  userItems = computed(() => this.items().filter(i => i.resource_type === 'user'));
  groupItems = computed(() => this.items().filter(i => i.resource_type === 'group'));

  constructor() {
    // Auto-reload when server changes
    effect(() => {
      const server = this.serverConfigService.selectedConfig();
      if (server) {
        this.loadData(server.id);
      } else {
        this.items.set([]);
      }
    });

    // Re-apply Monaco model when editorType changes (User ↔ Group)
    effect(() => {
      const _type = this.editorType(); // track dependency
      if (this.monacoEditor) {
        this.applyEditorModel();
      }
    });
  }

  ngOnDestroy(): void {
    this.disposeMonacoModel();
  }

  async ngOnInit() {
    const server = this.serverConfigService.selectedConfig();
    if (server) {
      await this.loadData(server.id);
    }
  }

  async loadData(serverConfigId: string) {
    this.loading.set(true);
    try {
      const data = await this.tauriService.getSampleData(serverConfigId);
      this.items.set(data);
    } catch (err: any) {
      this.notificationService.error('Failed to load sample data: ' + (err?.message || err));
    } finally {
      this.loading.set(false);
    }
  }

  startNew(type: 'user' | 'group') {
    this.editingItem.set(null);
    this.isNew.set(true);
    this.editorName.set('');
    this.editorType.set(type);
    this.jsonError.set('');

    if (type === 'user') {
      this.editorJson.set(JSON.stringify({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'user@example.com',
        name: { givenName: 'First', familyName: 'Last' },
        displayName: 'First Last',
        emails: [{ value: 'user@example.com', type: 'work', primary: true }],
        active: true,
      }, null, 2));
    } else {
      this.editorJson.set(JSON.stringify({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
        displayName: 'Team Name',
        members: [],
      }, null, 2));
    }
  }

  editItem(item: SampleData) {
    this.editingItem.set(item);
    this.isNew.set(false);
    this.editorName.set(item.name);
    this.editorType.set(item.resource_type as 'user' | 'group');
    this.editorJson.set(item.data_json);
    this.jsonError.set('');
  }

  duplicateItem(item: SampleData) {
    this.editingItem.set(null);
    this.isNew.set(true);
    this.editorName.set(item.name + ' (Copy)');
    this.editorType.set(item.resource_type as 'user' | 'group');
    this.editorJson.set(item.data_json);
    this.jsonError.set('');
  }

  cancelEdit() {
    this.editingItem.set(null);
    this.isNew.set(false);
  }

  validateJson(): boolean {
    try {
      JSON.parse(this.editorJson());
      this.jsonError.set('');
      return true;
    } catch (e: any) {
      this.jsonError.set(e.message);
      return false;
    }
  }

  formatJson() {
    if (this.monacoEditor) {
      this.monacoEditor.getAction('editor.action.formatDocument')?.run();
      return;
    }
    try {
      const parsed = JSON.parse(this.editorJson());
      this.editorJson.set(JSON.stringify(parsed, null, 2));
      this.jsonError.set('');
    } catch (e: any) {
      this.jsonError.set(e.message);
    }
  }

  async saveItem() {
    if (!this.validateJson()) return;
    const server = this.serverConfigService.selectedConfig();
    if (!server) {
      this.notificationService.error('Select a server first.');
      return;
    }
    if (!this.editorName().trim()) {
      this.notificationService.error('Name is required.');
      return;
    }

    this.saving.set(true);
    try {
      const existing = this.editingItem();
      await this.tauriService.saveSampleData({
        id: existing?.id || '',
        server_config_id: server.id,
        resource_type: this.editorType(),
        name: this.editorName().trim(),
        data_json: this.editorJson(),
        is_default: existing?.is_default ?? false,
        created_at: existing?.created_at || '',
      });
      this.notificationService.success(this.isNew() ? 'Sample data created.' : 'Sample data updated.');
      this.cancelEdit();
      await this.loadData(server.id);
    } catch (err: any) {
      this.notificationService.error('Failed to save: ' + (err?.message || err));
    } finally {
      this.saving.set(false);
    }
  }

  async deleteItem(item: SampleData) {
    const server = this.serverConfigService.selectedConfig();
    if (!server) return;
    try {
      await this.tauriService.deleteSampleData(item.id, server.id);
      this.notificationService.success('Deleted "' + item.name + '".');
      await this.loadData(server.id);
    } catch (err: any) {
      this.notificationService.error('Delete failed: ' + (err?.message || err));
    }
  }

  async seedDefaults() {
    const server = this.serverConfigService.selectedConfig();
    if (!server) return;
    try {
      await this.tauriService.seedSampleData(server.id);
      this.notificationService.success('Default sample data seeded.');
      await this.loadData(server.id);
    } catch (err: any) {
      this.notificationService.error('Seed failed: ' + (err?.message || err));
    }
  }

  copyToClipboard(json: string) {
    navigator.clipboard.writeText(json).then(() => {
      this.notificationService.success('Copied to clipboard.');
    });
  }
}
