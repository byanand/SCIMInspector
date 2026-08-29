import { Component, inject, signal, OnInit, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { TauriService } from '../../services/tauri.service';
import { ServerConfigService } from '../../services/server-config.service';
import { NotificationService } from '../../services/notification.service';
import { NavCountsService } from '../../services/nav-counts.service';
import { BusyService } from '../../services/busy.service';
import { UI, TabDef } from '../../ui';
import { SampleData } from '../../models/interfaces';

type ResourceType = 'user' | 'group';
/** A card is read-only, being edited, or asking to confirm its own deletion. */
type CardMode = 'read' | 'edit' | 'confirm';

const USER_TEMPLATE = {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
  userName: 'user@example.com',
  name: { givenName: 'First', familyName: 'Last' },
  displayName: 'First Last',
  emails: [{ value: 'user@example.com', type: 'work', primary: true }],
  active: true,
};

const GROUP_TEMPLATE = {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
  displayName: 'Team Name',
  members: [],
};

@Component({
  selector: 'app-sample-data',
  imports: [FormsModule, MatTooltipModule, MatMenuModule, ...UI],
  templateUrl: './sample-data.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './sample-data.component.scss',
})
export class SampleDataComponent implements OnInit {
  private readonly tauri = inject(TauriService);
  private readonly notify = inject(NotificationService);
  private readonly counts = inject(NavCountsService);
  readonly serverConfigService = inject(ServerConfigService);
  readonly busy = inject(BusyService);

  readonly items = signal<SampleData[]>([]);
  readonly activeTab = signal<ResourceType>('user');

  /** id of the card currently in a non-read mode, and which mode that is. */
  readonly openId = signal<string | null>(null);
  readonly mode = signal<CardMode>('read');

  readonly draftName = signal('');
  readonly draftJson = signal('');

  /** Holds the last deletion so it can be put back. */
  readonly lastDeleted = signal<SampleData | null>(null);

  readonly tabs = computed<TabDef[]>(() => [
    { id: 'user', label: `Users (${this.count('user')})` },
    { id: 'group', label: `Groups (${this.count('group')})` },
  ]);

  readonly visible = computed(() =>
    this.items().filter((i) => i.resource_type === this.activeTab())
  );

  /** Live verdict on the draft, shown in the editor footer. */
  readonly draftStatus = computed(() => {
    try {
      const parsed = JSON.parse(this.draftJson());
      const attrs = parsed && typeof parsed === 'object' ? Object.keys(parsed).length : 0;
      return { valid: true, text: `Valid JSON · ${attrs} attributes` };
    } catch (e) {
      return { valid: false, text: e instanceof Error ? e.message : 'Invalid JSON' };
    }
  });

  constructor() {
    effect(() => {
      const server = this.serverConfigService.selectedConfig();
      if (server) {
        void this.loadData(server.id);
      } else {
        this.items.set([]);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    const server = this.serverConfigService.selectedConfig();
    if (server) await this.loadData(server.id);
  }

  private count(type: ResourceType): number {
    return this.items().filter((i) => i.resource_type === type).length;
  }

  async loadData(serverConfigId: string): Promise<void> {
    try {
      this.items.set(await this.tauri.getSampleData(serverConfigId));
    } catch (err) {
      this.notify.error('Failed to load sample data: ' + this.message(err));
    }
  }

  // ── Card modes ─────────────────────────────────────────────────────────────
  isMode(item: SampleData, mode: CardMode): boolean {
    return this.openId() === item.id && this.mode() === mode;
  }

  edit(item: SampleData): void {
    this.openId.set(item.id);
    this.mode.set('edit');
    this.draftName.set(item.name);
    this.draftJson.set(item.data_json);
  }

  askDelete(item: SampleData): void {
    this.openId.set(item.id);
    this.mode.set('confirm');
  }

  cancel(): void {
    this.openId.set(null);
    this.mode.set('read');
  }

  // ── Writes ─────────────────────────────────────────────────────────────────
  async save(item: SampleData): Promise<void> {
    if (!this.draftStatus().valid) return;

    const server = this.serverConfigService.selectedConfig();
    if (!server) return;

    if (!this.draftName().trim()) {
      this.notify.error('Name is required.');
      return;
    }

    try {
      await this.tauri.saveSampleData({
        id: item.id,
        server_config_id: server.id,
        resource_type: item.resource_type,
        name: this.draftName().trim(),
        data_json: this.draftJson(),
        is_default: item.is_default,
        created_at: item.created_at,
      });
      this.cancel();
      await this.refresh();
      this.notify.success('Template updated.');
    } catch (err) {
      this.notify.error('Failed to save: ' + this.message(err));
    }
  }

  async create(type: ResourceType): Promise<void> {
    const server = this.serverConfigService.selectedConfig();
    if (!server) return;

    const body = type === 'user' ? USER_TEMPLATE : GROUP_TEMPLATE;
    try {
      const created = await this.tauri.saveSampleData({
        id: '',
        server_config_id: server.id,
        resource_type: type,
        name: type === 'user' ? 'New user template' : 'New group template',
        data_json: JSON.stringify(body, null, 2),
        is_default: false,
        created_at: '',
      });
      this.activeTab.set(type);
      await this.refresh();
      // Drop straight into editing — a new template is never useful as-is.
      this.edit(created);
    } catch (err) {
      this.notify.error('Failed to create: ' + this.message(err));
    }
  }

  async duplicate(item: SampleData): Promise<void> {
    const server = this.serverConfigService.selectedConfig();
    if (!server) return;

    try {
      await this.tauri.saveSampleData({
        id: '',
        server_config_id: server.id,
        resource_type: item.resource_type,
        name: `${item.name} (copy)`,
        data_json: item.data_json,
        is_default: false,
        created_at: '',
      });
      await this.refresh();
    } catch (err) {
      this.notify.error('Failed to duplicate: ' + this.message(err));
    }
  }

  async confirmDelete(item: SampleData): Promise<void> {
    const server = this.serverConfigService.selectedConfig();
    if (!server) return;

    try {
      await this.tauri.deleteSampleData(item.id, server.id);
      // Kept so the undo banner can restore it without a round trip.
      this.lastDeleted.set(item);
      this.cancel();
      await this.refresh();
    } catch (err) {
      this.notify.error('Delete failed: ' + this.message(err));
    }
  }

  /** Re-creates the deleted template. It returns with a new id. */
  async undoDelete(): Promise<void> {
    const item = this.lastDeleted();
    const server = this.serverConfigService.selectedConfig();
    if (!item || !server) return;

    try {
      await this.tauri.saveSampleData({
        id: '',
        server_config_id: server.id,
        resource_type: item.resource_type,
        name: item.name,
        data_json: item.data_json,
        is_default: item.is_default,
        created_at: '',
      });
      this.lastDeleted.set(null);
      await this.refresh();
    } catch (err) {
      this.notify.error('Restore failed: ' + this.message(err));
    }
  }

  dismissUndo(): void {
    this.lastDeleted.set(null);
  }

  async seedDefaults(): Promise<void> {
    const server = this.serverConfigService.selectedConfig();
    if (!server) return;

    await this.busy.run('seed', async () => {
      try {
        await this.tauri.seedSampleData(server.id);
        await this.refresh();
        this.notify.success('Default templates seeded.');
      } catch (err) {
        this.notify.error('Seed failed: ' + this.message(err));
      }
    });
  }

  copy(json: string): void {
    void navigator.clipboard.writeText(json).then(() => this.notify.success('Copied to clipboard.'));
  }

  meta(item: SampleData): string {
    const label = item.resource_type === 'user' ? 'User template' : 'Group template';
    const attrs = this.attributeCount(item.data_json);
    return attrs === null ? label : `${label} · ${attrs} attributes`;
  }

  deleteNote(item: SampleData): string {
    return item.is_default
      ? 'This is a seeded default. Seed defaults will bring it back.'
      : 'This template is only stored locally and is not referenced by past runs.';
  }

  private attributeCount(json: string): number | null {
    try {
      const parsed = JSON.parse(json);
      return parsed && typeof parsed === 'object' ? Object.keys(parsed).length : null;
    } catch {
      return null;
    }
  }

  private async refresh(): Promise<void> {
    const server = this.serverConfigService.selectedConfig();
    if (!server) return;
    await this.loadData(server.id);
    await this.counts.refreshForServer(server.id);
  }

  private message(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
