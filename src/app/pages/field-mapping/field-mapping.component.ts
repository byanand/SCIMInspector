import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule } from '@angular/material/table';
import { TauriService } from '../../services/tauri.service';
import { ServerConfigService } from '../../services/server-config.service';
import { NotificationService } from '../../services/notification.service';
import { FieldMappingRule, FieldFormat, DiscoveredSchemaAttribute } from '../../models/interfaces';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

interface ScimAttributePreset {
  attribute: string;
  displayName: string;
  description: string;
  suggestedFormat: FieldFormat;
}

@Component({
  selector: 'app-field-mapping',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatCheckboxModule,
    MatChipsModule, MatDividerModule, MatTooltipModule, MatTableModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './field-mapping.component.html',
  styleUrl: './field-mapping.component.scss'
})
export class FieldMappingComponent implements OnInit {
  private tauriService = inject(TauriService);
  readonly serverConfigService = inject(ServerConfigService);
  private notificationService = inject(NotificationService);

  // State
  rules = signal<FieldMappingRule[]>([]);
  editingRule = signal<Partial<FieldMappingRule> | null>(null);
  loading = signal(false);

  // Schema discovery state
  discoveredAttributes = signal<DiscoveredSchemaAttribute[]>([]);
  loadingSchema = signal(false);
  schemaLoaded = signal(false);

  // Available format options
  formatOptions: { value: FieldFormat; label: string; description: string }[] = [
    { value: 'none', label: 'No format check', description: 'Accept any value' },
    { value: 'email', label: 'Email address', description: 'Must be a valid email (user@domain.com)' },
    { value: 'uri', label: 'URI / URL', description: 'Must be a valid URI' },
    { value: 'phone', label: 'Phone number', description: 'Must match E.164 or common phone patterns' },
    { value: 'boolean', label: 'Boolean', description: 'Must be true or false' },
    { value: 'integer', label: 'Integer', description: 'Must be a whole number' },
    { value: 'datetime', label: 'DateTime (ISO 8601)', description: 'Must be a valid ISO 8601 date-time' },
    { value: 'regex', label: 'Custom regex', description: 'Match a custom regular expression' },
  ];

  // Common SCIM attributes users can pick from
  scimPresets: ScimAttributePreset[] = [
    { attribute: 'userName', displayName: 'User Name', description: 'Unique identifier, often login name', suggestedFormat: 'none' },
    { attribute: 'name.givenName', displayName: 'Given Name (First)', description: 'User\'s first name', suggestedFormat: 'none' },
    { attribute: 'name.familyName', displayName: 'Family Name (Last)', description: 'User\'s last name', suggestedFormat: 'none' },
    { attribute: 'name.formatted', displayName: 'Formatted Name', description: 'Full formatted display name', suggestedFormat: 'none' },
    { attribute: 'displayName', displayName: 'Display Name', description: 'Name shown in UI', suggestedFormat: 'none' },
    { attribute: 'emails[0].value', displayName: 'Primary Email', description: 'Primary email address', suggestedFormat: 'email' },
    { attribute: 'emails[0].type', displayName: 'Email Type', description: 'Type of primary email (work, home)', suggestedFormat: 'none' },
    { attribute: 'phoneNumbers[0].value', displayName: 'Primary Phone', description: 'Primary phone number', suggestedFormat: 'phone' },
    { attribute: 'title', displayName: 'Job Title', description: 'User\'s job title', suggestedFormat: 'none' },
    { attribute: 'active', displayName: 'Active', description: 'Whether the user is active', suggestedFormat: 'none' },
    { attribute: 'externalId', displayName: 'External ID', description: 'ID in external system', suggestedFormat: 'none' },
    { attribute: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department', displayName: 'Department', description: 'Enterprise extension: department', suggestedFormat: 'none' },
    { attribute: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager.value', displayName: 'Manager', description: 'Enterprise extension: manager ref', suggestedFormat: 'none' },
  ];

  // Computed: presets not yet added as rules
  availablePresets = computed(() => {
    const existingAttrs = new Set(this.rules().map(r => r.scim_attribute));
    return this.scimPresets.filter(p => !existingAttrs.has(p.attribute));
  });

  // Computed: discovered attributes not yet added as rules
  availableDiscovered = computed(() => {
    const existingAttrs = new Set(this.rules().map(r => r.scim_attribute));
    return this.discoveredAttributes().filter(a => !existingAttrs.has(this.discoveredAttrPath(a)));
  });

  displayedColumns = ['scim_attribute', 'display_name', 'required', 'format', 'actions'];

  async ngOnInit() {
    await this.serverConfigService.loadConfigs();
    const selectedId = this.serverConfigService.getSelectedId();
    if (selectedId) {
      await this.loadRules(selectedId);
    }
  }

  async loadRules(serverConfigId: string) {
    this.loading.set(true);
    try {
      const rules = await this.tauriService.getFieldMappingRules(serverConfigId);
      this.rules.set(rules);
    } catch (err: any) {
      this.notificationService.error('Failed to load rules: ' + (err?.message || err));
    } finally {
      this.loading.set(false);
    }
  }

  // Add from preset
  addFromPreset(preset: ScimAttributePreset) {
    const configId = this.serverConfigService.getSelectedId();
    if (!configId) {
      this.notificationService.error('Select a server profile first.');
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

  // Add custom attribute
  addCustom() {
    const configId = this.serverConfigService.getSelectedId();
    if (!configId) {
      this.notificationService.error('Select a server profile first.');
      return;
    }
    this.editingRule.set({
      server_config_id: configId,
      scim_attribute: '',
      display_name: '',
      required: false,
      format: 'none' as FieldFormat,
      description: '',
    });
  }

  // Edit existing rule
  editRule(rule: FieldMappingRule) {
    this.editingRule.set({ ...rule });
  }

  cancelEdit() {
    this.editingRule.set(null);
  }

  async saveRule() {
    const rule = this.editingRule();
    if (!rule) return;

    if (!rule.scim_attribute || !rule.display_name) {
      this.notificationService.error('Attribute path and display name are required.');
      return;
    }

    if (rule.format === 'regex' && !rule.regex_pattern) {
      this.notificationService.error('Regex pattern is required when format is "Custom regex".');
      return;
    }

    try {
      await this.tauriService.saveFieldMappingRule({
        id: rule.id || '',
        server_config_id: rule.server_config_id!,
        scim_attribute: rule.scim_attribute!,
        display_name: rule.display_name!,
        required: rule.required ?? false,
        format: rule.format || 'none',
        regex_pattern: rule.regex_pattern,
        description: rule.description,
        created_at: rule.created_at || '',
        updated_at: '',
      });
      this.editingRule.set(null);
      await this.loadRules(rule.server_config_id!);
      this.notificationService.success('Rule saved.');
    } catch (err: any) {
      this.notificationService.error('Failed to save: ' + (err?.message || err));
    }
  }

  async deleteRule(rule: FieldMappingRule) {
    try {
      await this.tauriService.deleteFieldMappingRule(rule.id);
      await this.loadRules(rule.server_config_id);
      this.notificationService.success('Rule deleted.');
    } catch (err: any) {
      this.notificationService.error('Failed to delete: ' + (err?.message || err));
    }
  }

  getFormatLabel(format: string): string {
    return this.formatOptions.find(f => f.value === format)?.label ?? format;
  }

  getFormatIcon(format: string): string {
    switch (format) {
      case 'email': return 'email';
      case 'uri': return 'link';
      case 'phone': return 'phone';
      case 'boolean': return 'toggle_on';
      case 'integer': return 'pin';
      case 'datetime': return 'schedule';
      case 'regex': return 'code';
      default: return 'remove';
    }
  }

  // ── Schema Discovery ──

  async loadSchemaAttributes() {
    const configId = this.serverConfigService.getSelectedId();
    if (!configId) return;

    this.loadingSchema.set(true);
    try {
      const attrs = await this.tauriService.discoverCustomSchema(configId);
      this.discoveredAttributes.set(attrs);
      this.schemaLoaded.set(true);
      if (attrs.length === 0) {
        this.notificationService.info('No attributes found in schema endpoint.');
      } else {
        this.notificationService.success(`Discovered ${attrs.length} attributes from server schemas.`);
      }
    } catch (err: any) {
      this.notificationService.error('Schema discovery failed: ' + (err?.message || err));
    } finally {
      this.loadingSchema.set(false);
    }
  }

  discoveredAttrPath(attr: DiscoveredSchemaAttribute): string {
    const coreSchemas = [
      'urn:ietf:params:scim:schemas:core:2.0:User',
      'urn:ietf:params:scim:schemas:core:2.0:Group',
      'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
      'urn:ietf:params:scim:schemas:core:2.0:ResourceType',
      'urn:ietf:params:scim:schemas:core:2.0:Schema',
    ];
    if (coreSchemas.includes(attr.schema_urn)) {
      return attr.attr_name;
    }
    return `${attr.schema_urn}:${attr.attr_name}`;
  }

  discoveredDisplayName(attr: DiscoveredSchemaAttribute): string {
    // Convert camelCase to Title Case
    return attr.attr_name
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/^./, s => s.toUpperCase());
  }

  guessFormat(attrType: string): FieldFormat {
    const t = attrType.toLowerCase();
    if (t === 'reference') return 'uri';
    if (t === 'boolean') return 'boolean';
    if (t === 'integer' || t === 'decimal') return 'integer';
    if (t === 'datetime') return 'datetime';
    return 'none';
  }

  addFromDiscovered(attr: DiscoveredSchemaAttribute) {
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

  addAllDiscovered() {
    const configId = this.serverConfigService.getSelectedId();
    if (!configId) return;

    const available = this.availableDiscovered();
    if (available.length === 0) {
      this.notificationService.info('All discovered attributes are already added.');
      return;
    }

    // Save all in sequence
    this.loading.set(true);
    const saveSequentially = async () => {
      let saved = 0;
      for (const attr of available) {
        try {
          await this.tauriService.saveFieldMappingRule({
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
        } catch { /* skip duplicates */ }
      }
      await this.loadRules(configId);
      this.loading.set(false);
      this.notificationService.success(`Added ${saved} rules from discovered attributes.`);
    };
    saveSequentially();
  }
}
