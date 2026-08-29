import { Component, inject, signal, OnInit, computed, effect, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TauriService } from '../../services/tauri.service';
import { ServerConfigService } from '../../services/server-config.service';
import { NotificationService } from '../../services/notification.service';
import { ScimSchemaService } from '../../services/scim-schema.service';
import { NavCountsService } from '../../services/nav-counts.service';
import { BusyService } from '../../services/busy.service';
import { UI } from '../../ui';
import { FieldMappingRule, FieldFormat, DiscoveredSchemaAttribute } from '../../models/interfaces';

interface ScimAttributePreset {
  attribute: string;
  displayName: string;
  description: string;
  suggestedFormat: FieldFormat;
}

const CORE_SCHEMAS = new Set([
  'urn:ietf:params:scim:schemas:core:2.0:User',
  'urn:ietf:params:scim:schemas:core:2.0:Group',
  'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
  'urn:ietf:params:scim:schemas:core:2.0:ResourceType',
  'urn:ietf:params:scim:schemas:core:2.0:Schema',
]);

const FORMAT_ICONS: Record<string, string> = {
  email: 'mail',
  uri: 'link',
  phone: 'call',
  boolean: 'toggle_on',
  integer: 'pin',
  datetime: 'schedule',
  regex: 'code',
};

@Component({
  selector: 'app-field-mapping',
  imports: [FormsModule, MatTooltipModule, ...UI],
  templateUrl: './field-mapping.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './field-mapping.component.scss',
})
export class FieldMappingComponent implements OnInit {
  private readonly tauri = inject(TauriService);
  private readonly notify = inject(NotificationService);
  private readonly counts = inject(NavCountsService);
  readonly serverConfigService = inject(ServerConfigService);
  readonly scimSchemaService = inject(ScimSchemaService);
  readonly busy = inject(BusyService);

  readonly rules = signal<FieldMappingRule[]>([]);
  readonly editingRule = signal<Partial<FieldMappingRule> | null>(null);

  readonly formatOptions: { value: FieldFormat; label: string }[] = [
    { value: 'none', label: 'No format check' },
    { value: 'email', label: 'Email address' },
    { value: 'uri', label: 'URI / URL' },
    { value: 'phone', label: 'Phone number' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'integer', label: 'Integer' },
    { value: 'datetime', label: 'DateTime (ISO 8601)' },
    { value: 'regex', label: 'Custom regex' },
  ];

  readonly scimPresets: ScimAttributePreset[] = [
    { attribute: 'userName', displayName: 'User Name', description: 'Unique identifier, often login name', suggestedFormat: 'none' },
    { attribute: 'name.givenName', displayName: 'Given Name (First)', description: "User's first name", suggestedFormat: 'none' },
    { attribute: 'name.familyName', displayName: 'Family Name (Last)', description: "User's last name", suggestedFormat: 'none' },
    { attribute: 'name.formatted', displayName: 'Formatted Name', description: 'Full formatted display name', suggestedFormat: 'none' },
    { attribute: 'displayName', displayName: 'Display Name', description: 'Name shown in UI', suggestedFormat: 'none' },
    { attribute: 'emails[0].value', displayName: 'Primary Email', description: 'Primary email address', suggestedFormat: 'email' },
    { attribute: 'emails[0].type', displayName: 'Email Type', description: 'Type of primary email (work, home)', suggestedFormat: 'none' },
    { attribute: 'phoneNumbers[0].value', displayName: 'Primary Phone', description: 'Primary phone number', suggestedFormat: 'phone' },
    { attribute: 'title', displayName: 'Job Title', description: "User's job title", suggestedFormat: 'none' },
    { attribute: 'active', displayName: 'Active', description: 'Whether the user is active', suggestedFormat: 'none' },
    { attribute: 'externalId', displayName: 'External ID', description: 'ID in external system', suggestedFormat: 'none' },
    { attribute: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department', displayName: 'Department', description: 'Enterprise extension: department', suggestedFormat: 'none' },
    { attribute: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager.value', displayName: 'Manager', description: 'Enterprise extension: manager ref', suggestedFormat: 'none' },
  ];

  /** Rows for the table, with presentation decided once rather than in the template. */
  readonly ruleRows = computed(() =>
    this.rules().map((r) => ({
      ...r,
      formatLabel: this.formatLabel(r.format),
      formatIcon: FORMAT_ICONS[r.format] ?? 'remove',
    }))
  );

  readonly availablePresets = computed(() => {
    const existing = new Set(this.rules().map((r) => r.scim_attribute));
    return this.scimPresets.filter((p) => !existing.has(p.attribute));
  });

  readonly availableDiscovered = computed(() => {
    const existing = new Set(this.rules().map((r) => r.scim_attribute));
    const seen = new Set<string>();
    return this.scimSchemaService.discoveredAttributes().filter((a) => {
      const path = this.discoveredAttrPath(a);
      if (existing.has(path) || seen.has(path)) return false;
      seen.add(path);
      return true;
    });
  });

  constructor() {
    effect(() => {
      const server = this.serverConfigService.selectedConfig();
      if (server) {
        void this.loadRules(server.id);
      } else {
        this.rules.set([]);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    await this.serverConfigService.loadConfigs();
    const selectedId = this.serverConfigService.getSelectedId();
    if (selectedId) await this.loadRules(selectedId);
  }

  async loadRules(serverConfigId: string): Promise<void> {
    try {
      this.rules.set(await this.tauri.getFieldMappingRules(serverConfigId));
    } catch (err) {
      this.notify.error('Failed to load rules: ' + this.message(err));
    }
  }

  // ── Editing ────────────────────────────────────────────────────────────────
  addCustom(): void {
    const configId = this.serverConfigService.getSelectedId();
    if (!configId) {
      this.notify.error('Select a server profile first.');
      return;
    }
    this.editingRule.set({
      server_config_id: configId,
      scim_attribute: '',
      display_name: '',
      required: false,
      format: 'none',
      description: '',
    });
  }

  addFromPreset(preset: ScimAttributePreset): void {
    const configId = this.serverConfigService.getSelectedId();
    if (!configId) {
      this.notify.error('Select a server profile first.');
      return;
    }
    this.editingRule.set({
      server_config_id: configId,
      scim_attribute: preset.attribute,
      display_name: preset.displayName,
      required: false,
      format: preset.suggestedFormat,
      description: preset.description,
    });
  }

  addFromDiscovered(attr: DiscoveredSchemaAttribute): void {
    const configId = this.serverConfigService.getSelectedId();
    if (!configId) return;

    this.editingRule.set({
      server_config_id: configId,
      scim_attribute: this.discoveredAttrPath(attr),
      display_name: this.discoveredDisplayName(attr),
      required: false,
      format: this.guessFormat(attr.attr_type),
      description: `${attr.schema_name} — type: ${attr.attr_type}`,
    });
  }

  editRule(rule: FieldMappingRule): void {
    this.editingRule.set({ ...rule });
  }

  cancelEdit(): void {
    this.editingRule.set(null);
  }

  patchDraft<K extends keyof FieldMappingRule>(key: K, value: FieldMappingRule[K]): void {
    this.editingRule.update((r) => (r ? { ...r, [key]: value } : r));
  }

  async saveRule(): Promise<void> {
    const rule = this.editingRule();
    if (!rule) return;

    if (!rule.scim_attribute || !rule.display_name) {
      this.notify.error('Attribute path and display name are required.');
      return;
    }

    if (rule.format === 'regex' && !rule.regex_pattern) {
      this.notify.error('Regex pattern is required when format is "Custom regex".');
      return;
    }

    try {
      await this.tauri.saveFieldMappingRule({
        id: rule.id || '',
        server_config_id: rule.server_config_id!,
        scim_attribute: rule.scim_attribute,
        display_name: rule.display_name,
        required: rule.required ?? false,
        format: rule.format || 'none',
        regex_pattern: rule.regex_pattern,
        description: rule.description,
        created_at: rule.created_at || '',
        updated_at: '',
      });
      this.editingRule.set(null);
      await this.refresh();
      this.notify.success('Rule saved.');
    } catch (err) {
      this.notify.error('Failed to save: ' + this.message(err));
    }
  }

  async deleteRule(rule: FieldMappingRule): Promise<void> {
    try {
      await this.tauri.deleteFieldMappingRule(rule.id);
      await this.refresh();
      this.notify.success('Rule deleted.');
    } catch (err) {
      this.notify.error('Failed to delete: ' + this.message(err));
    }
  }

  /** Re-reads /Schemas so the discovered panel reflects the live server. */
  async discover(): Promise<void> {
    const server = this.serverConfigService.selectedConfig();
    if (!server) return;

    await this.busy.run('discover', async () => {
      try {
        await this.scimSchemaService.refreshSchemas();
        this.notify.success('Schemas refreshed.');
      } catch (err) {
        this.notify.error('Discovery failed: ' + this.message(err));
      }
    });
  }

  async addAllDiscovered(): Promise<void> {
    const configId = this.serverConfigService.getSelectedId();
    if (!configId) return;

    const available = this.availableDiscovered();
    if (available.length === 0) {
      this.notify.info('All discovered attributes are already added.');
      return;
    }

    await this.busy.run('discover', async () => {
      let saved = 0;
      for (const attr of available) {
        try {
          await this.tauri.saveFieldMappingRule({
            id: '',
            server_config_id: configId,
            scim_attribute: this.discoveredAttrPath(attr),
            display_name: this.discoveredDisplayName(attr),
            required: false,
            format: this.guessFormat(attr.attr_type),
            regex_pattern: undefined,
            description: `${attr.schema_name} — type: ${attr.attr_type}`,
            created_at: '',
            updated_at: '',
          });
          saved++;
        } catch {
          // A duplicate is not a failure worth interrupting the batch for.
        }
      }
      await this.refresh();
      this.notify.success(`Added ${saved} rules from discovered attributes.`);
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  formatLabel(format: string): string {
    return this.formatOptions.find((f) => f.value === format)?.label ?? format;
  }

  /** Core attributes are addressed bare; extensions keep their URN prefix. */
  discoveredAttrPath(attr: DiscoveredSchemaAttribute): string {
    return CORE_SCHEMAS.has(attr.schema_urn)
      ? attr.attr_name
      : `${attr.schema_urn}:${attr.attr_name}`;
  }

  discoveredDisplayName(attr: DiscoveredSchemaAttribute): string {
    return attr.attr_name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (s) => s.toUpperCase());
  }

  guessFormat(attrType: string): FieldFormat {
    switch (attrType.toLowerCase()) {
      case 'reference':
        return 'uri';
      case 'boolean':
        return 'boolean';
      case 'integer':
      case 'decimal':
        return 'integer';
      case 'datetime':
        return 'datetime';
      default:
        return 'none';
    }
  }

  private async refresh(): Promise<void> {
    const configId = this.serverConfigService.getSelectedId();
    if (!configId) return;
    await this.loadRules(configId);
    await this.counts.refreshForServer(configId);
  }

  private message(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
