import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTabsModule } from '@angular/material/tabs';
import { MatBadgeModule } from '@angular/material/badge';
import { TauriService } from '../../services/tauri.service';
import { NotificationService } from '../../services/notification.service';
import { ServerConfigService } from '../../services/server-config.service';
import {
  ServerConfig,
  ScimOperation,
  ExplorerResponse,
  ExplorerHistoryEntry,
  FieldMappingRule,
  DiscoveredSchemaAttribute,
} from '../../models/interfaces';

// ── Operation Definitions ──

const SCIM_OPERATIONS: ScimOperation[] = [
  {
    id: 'create_user',
    name: 'Create User',
    method: 'POST',
    pathTemplate: '/Users',
    bodyTemplate: JSON.stringify({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: 'john.doe@example.com',
      name: { givenName: 'John', familyName: 'Doe', formatted: 'John Doe' },
      displayName: 'John Doe',
      emails: [{ value: 'john.doe@example.com', type: 'work', primary: true }],
      phoneNumbers: [{ value: '+1-555-0100', type: 'work' }],
      title: 'Software Engineer',
      active: true,
    }, null, 2),
    description: 'Create a new user resource',
    icon: 'person_add',
    category: 'user',
    needsId: false,
    aiGeneratable: true,
    aiOperation: 'create_user',
  },
  {
    id: 'list_users',
    name: 'List Users',
    method: 'GET',
    pathTemplate: '/Users',
    description: 'List all users with pagination',
    icon: 'people',
    category: 'user',
    needsId: false,
    aiGeneratable: false,
  },
  {
    id: 'get_user',
    name: 'Get User',
    method: 'GET',
    pathTemplate: '/Users/{id}',
    description: 'Get a specific user by ID',
    icon: 'person_search',
    category: 'user',
    needsId: true,
    aiGeneratable: false,
  },
  {
    id: 'update_user',
    name: 'Update User (PUT)',
    method: 'PUT',
    pathTemplate: '/Users/{id}',
    bodyTemplate: JSON.stringify({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      userName: 'john.doe@example.com',
      name: { givenName: 'John', familyName: 'Doe', formatted: 'John Doe' },
      displayName: 'John Doe',
      emails: [{ value: 'john.doe@example.com', type: 'work', primary: true }],
      phoneNumbers: [{ value: '+1-555-0100', type: 'work' }],
      title: 'Senior Software Engineer',
      active: true,
    }, null, 2),
    description: 'Full replacement update of a user',
    icon: 'edit',
    category: 'user',
    needsId: true,
    aiGeneratable: true,
    aiOperation: 'update_user',
  },
  {
    id: 'change_user_name',
    name: 'Change User Name',
    method: 'PATCH',
    pathTemplate: '/Users/{id}',
    bodyTemplate: JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [{
        op: 'replace',
        value: {
          name: { givenName: 'Jane', familyName: 'Smith', formatted: 'Jane Smith' },
          displayName: 'Jane Smith',
        },
      }],
    }, null, 2),
    description: 'Change a user\'s name via PATCH',
    icon: 'badge',
    category: 'user',
    needsId: true,
    aiGeneratable: true,
    aiOperation: 'change_user_name',
  },
  {
    id: 'activate_user',
    name: 'Activate User',
    method: 'PATCH',
    pathTemplate: '/Users/{id}',
    bodyTemplate: JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [{ op: 'replace', path: 'active', value: true }],
    }, null, 2),
    description: 'Activate a user account',
    icon: 'check_circle',
    category: 'user',
    needsId: true,
    aiGeneratable: false,
  },
  {
    id: 'deactivate_user',
    name: 'Deactivate User',
    method: 'PATCH',
    pathTemplate: '/Users/{id}',
    bodyTemplate: JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [{ op: 'replace', path: 'active', value: false }],
    }, null, 2),
    description: 'Deactivate a user account',
    icon: 'block',
    category: 'user',
    needsId: true,
    aiGeneratable: false,
  },
  {
    id: 'delete_user',
    name: 'Delete User',
    method: 'DELETE',
    pathTemplate: '/Users/{id}',
    description: 'Delete a user resource',
    icon: 'person_remove',
    category: 'user',
    needsId: true,
    aiGeneratable: false,
  },
  {
    id: 'create_group',
    name: 'Create Group',
    method: 'POST',
    pathTemplate: '/Groups',
    bodyTemplate: JSON.stringify({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      displayName: 'Engineering Team',
      members: [],
    }, null, 2),
    description: 'Create a new group resource',
    icon: 'group_add',
    category: 'group',
    needsId: false,
    aiGeneratable: true,
    aiOperation: 'create_group',
  },
  {
    id: 'list_groups',
    name: 'List Groups',
    method: 'GET',
    pathTemplate: '/Groups',
    description: 'List all groups with pagination',
    icon: 'groups',
    category: 'group',
    needsId: false,
    aiGeneratable: false,
  },
  {
    id: 'add_user_to_group',
    name: 'Add User to Group',
    method: 'PATCH',
    pathTemplate: '/Groups/{id}',
    bodyTemplate: JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [{
        op: 'add',
        path: 'members',
        value: [{ value: '{userId}', display: 'User Name' }],
      }],
    }, null, 2),
    description: 'Add a user to a group',
    icon: 'group_add',
    category: 'group',
    needsId: true,
    needsGroupId: true,
    aiGeneratable: false,
  },
  {
    id: 'remove_user_from_group',
    name: 'Remove User from Group',
    method: 'PATCH',
    pathTemplate: '/Groups/{id}',
    bodyTemplate: JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
      Operations: [{
        op: 'remove',
        path: 'members[value eq "{userId}"]',
      }],
    }, null, 2),
    description: 'Remove a user from a group',
    icon: 'group_remove',
    category: 'group',
    needsId: true,
    needsGroupId: true,
    aiGeneratable: false,
  },
  {
    id: 'delete_group',
    name: 'Delete Group',
    method: 'DELETE',
    pathTemplate: '/Groups/{id}',
    description: 'Delete a group resource',
    icon: 'group_remove',
    category: 'group',
    needsId: true,
    needsGroupId: true,
    aiGeneratable: false,
  },
];

@Component({
  selector: 'app-explorer',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatSelectModule, MatFormFieldModule, MatInputModule, MatTooltipModule,
    MatChipsModule, MatDividerModule, MatProgressSpinnerModule,
    MatExpansionModule, MatTabsModule, MatBadgeModule
  ],
  templateUrl: './explorer.component.html',
  styleUrl: './explorer.component.scss',
})
export class ExplorerComponent implements OnInit {
  private tauriService = inject(TauriService);
  private notificationService = inject(NotificationService);
  serverConfigService = inject(ServerConfigService);

  // Operations
  operations = SCIM_OPERATIONS;
  userOps = SCIM_OPERATIONS.filter(o => o.category === 'user');
  groupOps = SCIM_OPERATIONS.filter(o => o.category === 'group');

  // State
  selectedServer = signal<ServerConfig | null>(null);
  selectedOperation = signal<ScimOperation | null>(null);
  httpMethod = signal('GET');
  requestPath = signal('');
  requestBody = signal('');
  queryParams = signal('');
  resourceId = signal('');

  // Response
  response = signal<ExplorerResponse | null>(null);
  loading = signal(false);
  generating = signal(false);

  // AI
  hasOpenAiKey = signal(false);

  // Auto-fetched resources for ID pickers
  availableUsers = signal<{ id: string; userName: string; displayName: string }[]>([]);
  availableGroups = signal<{ id: string; displayName: string }[]>([]);
  fetchingUsers = signal(false);
  fetchingGroups = signal(false);

  // Custom field mappings
  fieldMappingRules = signal<FieldMappingRule[]>([]);
  enabledCustomFields = signal<Set<string>>(new Set());
  loadingMappings = signal(false);

  // Schema discovery
  discoveredAttributes = signal<DiscoveredSchemaAttribute[]>([]);
  enabledSchemaAttrs = signal<Set<string>>(new Set());
  loadingSchema = signal(false);
  schemaLoaded = signal(false);

  // Session history
  sessionHistory = signal<ExplorerHistoryEntry[]>([]);
  showHistory = signal(false);

  // Computed: rules applicable to current operation category
  applicableRules = computed(() => {
    const op = this.selectedOperation();
    if (!op || !this.hasBody()) return [];
    // For user operations, show user-related rules; for group ops, show group rules
    // All rules are potentially applicable since user defines them
    return this.fieldMappingRules();
  });

  // Computed
  hasBody = computed(() => {
    const m = this.httpMethod();
    return m === 'POST' || m === 'PUT' || m === 'PATCH';
  });

  responseBodyFormatted = computed(() => {
    const resp = this.response();
    if (!resp?.body) return '';
    try {
      return JSON.stringify(JSON.parse(resp.body), null, 2);
    } catch {
      return resp.body;
    }
  });

  responseHeaderEntries = computed(() => {
    const resp = this.response();
    if (!resp?.headers) return [];
    return Object.entries(resp.headers);
  });

  statusClass = computed(() => {
    const s = this.response()?.status;
    if (!s) return '';
    if (s >= 200 && s < 300) return 'status-2xx';
    if (s >= 300 && s < 400) return 'status-3xx';
    if (s >= 400 && s < 500) return 'status-4xx';
    return 'status-5xx';
  });

  async ngOnInit() {
    // Check for OpenAI key
    try {
      const key = await this.tauriService.getAppSetting('openai_api_key');
      this.hasOpenAiKey.set(!!key);
    } catch { /* ignore */ }
  }

  selectServer(server: ServerConfig) {
    this.selectedServer.set(server);
    // Reset fetched data when server changes
    this.availableUsers.set([]);
    this.availableGroups.set([]);
    this.enabledCustomFields.set(new Set());
    this.discoveredAttributes.set([]);
    this.enabledSchemaAttrs.set(new Set());
    this.schemaLoaded.set(false);
    // Fetch field mapping rules for this server
    this.loadFieldMappings(server.id);
  }

  async loadFieldMappings(serverConfigId: string) {
    this.loadingMappings.set(true);
    try {
      const rules = await this.tauriService.getFieldMappingRules(serverConfigId);
      this.fieldMappingRules.set(rules);
    } catch { /* silent */ }
    finally { this.loadingMappings.set(false); }
  }

  async loadSchemaAttributes() {
    const server = this.selectedServer();
    if (!server) return;
    this.loadingSchema.set(true);
    try {
      const attrs = await this.tauriService.discoverCustomSchema(server.id);
      this.discoveredAttributes.set(attrs);
      this.schemaLoaded.set(true);
      if (attrs.length === 0) {
        this.notificationService.info('No schema attributes discovered from server.');
      } else {
        this.notificationService.success(`Discovered ${attrs.length} attribute(s) from server schemas.`);
      }
    } catch (err: any) {
      this.notificationService.error('Schema discovery failed: ' + (err?.message || err));
    } finally {
      this.loadingSchema.set(false);
    }
  }

  /** Build a unique key for a discovered schema attribute */
  schemaAttrKey(attr: DiscoveredSchemaAttribute): string {
    return `${attr.schema_urn}:${attr.attr_name}`;
  }

  /** Build the SCIM attribute path for a discovered attribute */
  schemaAttrPath(attr: DiscoveredSchemaAttribute): string {
    // Core schema attributes go at the top level; extension attributes are namespaced
    if (attr.schema_urn === 'urn:ietf:params:scim:schemas:core:2.0:User' ||
        attr.schema_urn === 'urn:ietf:params:scim:schemas:core:2.0:Group') {
      return attr.attr_name;
    }
    // Use ':' separator (SCIM convention) — parseScimPath handles this
    return `${attr.schema_urn}:${attr.attr_name}`;
  }

  /** Guess a placeholder format from the discovered type */
  private guessFormat(attrType: string): string {
    switch (attrType.toLowerCase()) {
      case 'boolean': return 'none';
      case 'integer': case 'decimal': return 'none';
      case 'reference': return 'uri';
      default: return 'none';
    }
  }

  /** Get an appropriate placeholder value based on the attribute type */
  private getSchemaPlaceholder(attrType: string): any {
    switch (attrType.toLowerCase()) {
      case 'boolean': return true;
      case 'integer': return 0;
      case 'decimal': return 0.0;
      case 'datetime': return new Date().toISOString();
      case 'reference': return 'https://example.com/resource';
      case 'complex': return {};
      default: return 'value';
    }
  }

  toggleSchemaAttr(attr: DiscoveredSchemaAttribute) {
    const key = this.schemaAttrKey(attr);
    const enabled = new Set(this.enabledSchemaAttrs());
    const attrPath = this.schemaAttrPath(attr);
    if (enabled.has(key)) {
      enabled.delete(key);
      this.removeScimAttribute(attrPath);
    } else {
      enabled.add(key);
      this.mergeScimAttributeWithValue(attrPath, this.getSchemaPlaceholder(attr.attr_type));
    }
    this.enabledSchemaAttrs.set(enabled);
  }

  isSchemaAttrEnabled(attr: DiscoveredSchemaAttribute): boolean {
    return this.enabledSchemaAttrs().has(this.schemaAttrKey(attr));
  }

  applyAllSchemaAttrs() {
    const attrs = this.discoveredAttributes();
    if (attrs.length === 0) return;
    const enabled = new Set<string>();
    for (const attr of attrs) {
      const attrPath = this.schemaAttrPath(attr);
      this.mergeScimAttributeWithValue(attrPath, this.getSchemaPlaceholder(attr.attr_type));
      enabled.add(this.schemaAttrKey(attr));
    }
    this.enabledSchemaAttrs.set(enabled);
    this.notificationService.success(`Applied ${attrs.length} schema attribute(s) to request body.`);
  }

  selectOperation(op: ScimOperation) {
    this.selectedOperation.set(op);
    this.httpMethod.set(op.method);
    this.requestPath.set(op.pathTemplate);
    this.requestBody.set(op.bodyTemplate || '');
    this.queryParams.set(
      op.method === 'GET' && (op.id === 'list_users' || op.id === 'list_groups')
        ? 'startIndex=1&count=10'
        : ''
    );
    this.resourceId.set('');
    this.response.set(null);

    // Auto-fetch resources if needed
    if (op.needsId && op.category === 'user' && this.availableUsers().length === 0) {
      this.fetchUsers();
    }
    if ((op.needsGroupId || (op.needsId && op.category === 'group')) && this.availableGroups().length === 0) {
      this.fetchGroups();
    }
  }

  onResourceIdChange(id: string) {
    this.resourceId.set(id);
    const op = this.selectedOperation();
    if (op) {
      this.requestPath.set(op.pathTemplate.replace('{id}', id || '{id}'));
    }
  }

  async fetchUsers() {
    if (!this.selectedServer()) return;
    this.fetchingUsers.set(true);
    try {
      const resp = await this.tauriService.executeScimRequest({
        server_config_id: this.selectedServer()!.id,
        method: 'GET',
        path: '/Users',
        query_params: 'startIndex=1&count=100',
      });
      if (resp.status >= 200 && resp.status < 300) {
        const data = JSON.parse(resp.body);
        const resources = data.Resources || data.resources || [];
        this.availableUsers.set(
          resources.map((r: any) => ({
            id: r.id,
            userName: r.userName || '',
            displayName: r.displayName || r.userName || r.id,
          }))
        );
      }
    } catch { /* silent */ }
    finally { this.fetchingUsers.set(false); }
  }

  async fetchGroups() {
    if (!this.selectedServer()) return;
    this.fetchingGroups.set(true);
    try {
      const resp = await this.tauriService.executeScimRequest({
        server_config_id: this.selectedServer()!.id,
        method: 'GET',
        path: '/Groups',
        query_params: 'startIndex=1&count=100',
      });
      if (resp.status >= 200 && resp.status < 300) {
        const data = JSON.parse(resp.body);
        const resources = data.Resources || data.resources || [];
        this.availableGroups.set(
          resources.map((r: any) => ({
            id: r.id,
            displayName: r.displayName || r.id,
          }))
        );
      }
    } catch { /* silent */ }
    finally { this.fetchingGroups.set(false); }
  }

  async sendRequest() {
    if (!this.selectedServer()) {
      this.notificationService.error('Select a server first.');
      return;
    }

    this.loading.set(true);
    this.response.set(null);

    try {
      const resp = await this.tauriService.executeScimRequest({
        server_config_id: this.selectedServer()!.id,
        method: this.httpMethod(),
        path: this.requestPath(),
        body: this.hasBody() ? this.requestBody() : undefined,
        query_params: this.queryParams() || undefined,
      });
      this.response.set(resp);

      // Auto-capture created resource IDs
      if (this.httpMethod() === 'POST' && resp.status >= 200 && resp.status < 300) {
        try {
          const created = JSON.parse(resp.body);
          if (created.id) {
            const op = this.selectedOperation();
            if (op?.id === 'create_user') {
              this.availableUsers.update(users => [...users, {
                id: created.id,
                userName: created.userName || '',
                displayName: created.displayName || created.userName || created.id,
              }]);
            } else if (op?.id === 'create_group') {
              this.availableGroups.update(groups => [...groups, {
                id: created.id,
                displayName: created.displayName || created.id,
              }]);
            }
          }
        } catch { /* ignore parsing errors */ }
      }

      // If list operation, refresh the available resources
      if (this.selectedOperation()?.id === 'list_users' && resp.status >= 200 && resp.status < 300) {
        try {
          const data = JSON.parse(resp.body);
          const resources = data.Resources || data.resources || [];
          this.availableUsers.set(
            resources.map((r: any) => ({
              id: r.id,
              userName: r.userName || '',
              displayName: r.displayName || r.userName || r.id,
            }))
          );
        } catch { /* ignore */ }
      }
      if (this.selectedOperation()?.id === 'list_groups' && resp.status >= 200 && resp.status < 300) {
        try {
          const data = JSON.parse(resp.body);
          const resources = data.Resources || data.resources || [];
          this.availableGroups.set(
            resources.map((r: any) => ({
              id: r.id,
              displayName: r.displayName || r.id,
            }))
          );
        } catch { /* ignore */ }
      }

      // Add to session history
      const op = this.selectedOperation();
      if (op) {
        this.sessionHistory.update(h => [{
          id: crypto.randomUUID(),
          operation: op,
          method: this.httpMethod(),
          path: this.requestPath(),
          requestBody: this.hasBody() ? this.requestBody() : undefined,
          response: resp,
          timestamp: new Date().toISOString(),
        }, ...h].slice(0, 50));
      }
    } catch (err: any) {
      this.notificationService.error('Request failed: ' + (err?.message || err));
    } finally {
      this.loading.set(false);
    }
  }

  async generateWithAi() {
    const op = this.selectedOperation();
    if (!op?.aiOperation) return;

    this.generating.set(true);
    try {
      const generated = await this.tauriService.generateScimData(op.aiOperation);
      // Pretty-format the JSON
      try {
        this.requestBody.set(JSON.stringify(JSON.parse(generated), null, 2));
      } catch {
        this.requestBody.set(generated);
      }
      this.notificationService.success('AI-generated data applied.');
    } catch (err: any) {
      this.notificationService.error('AI generation failed: ' + (err?.message || err));
    } finally {
      this.generating.set(false);
    }
  }

  loadHistoryEntry(entry: ExplorerHistoryEntry) {
    this.selectedOperation.set(entry.operation);
    this.httpMethod.set(entry.method);
    this.requestPath.set(entry.path);
    this.requestBody.set(entry.requestBody || '');
    this.response.set(entry.response);
    this.showHistory.set(false);
  }

  clearHistory() {
    this.sessionHistory.set([]);
  }

  getMethodColor(method: string): string {
    switch (method) {
      case 'GET': return '#4caf50';
      case 'POST': return '#2196f3';
      case 'PUT': return '#ff9800';
      case 'PATCH': return '#9c27b0';
      case 'DELETE': return '#f44336';
      default: return '#757575';
    }
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(
      () => this.notificationService.success('Copied to clipboard.'),
      () => this.notificationService.error('Failed to copy.')
    );
  }

  formatBody() {
    try {
      const formatted = JSON.stringify(JSON.parse(this.requestBody()), null, 2);
      this.requestBody.set(formatted);
    } catch {
      this.notificationService.error('Invalid JSON — cannot format.');
    }
  }

  // ── Custom Field Mapping Logic ──

  toggleCustomField(rule: FieldMappingRule) {
    const enabled = new Set(this.enabledCustomFields());
    if (enabled.has(rule.id)) {
      enabled.delete(rule.id);
      this.removeScimAttribute(rule.scim_attribute);
    } else {
      enabled.add(rule.id);
      this.mergeScimAttribute(rule.scim_attribute, rule.format);
    }
    this.enabledCustomFields.set(enabled);
  }

  applyAllCustomFields() {
    const rules = this.applicableRules();
    if (rules.length === 0) return;
    const enabled = new Set<string>();
    for (const rule of rules) {
      this.mergeScimAttribute(rule.scim_attribute, rule.format);
      enabled.add(rule.id);
    }
    this.enabledCustomFields.set(enabled);
    this.notificationService.success(`Applied ${rules.length} custom field(s) to request body.`);
  }

  isFieldEnabled(ruleId: string): boolean {
    return this.enabledCustomFields().has(ruleId);
  }

  /** Generate a placeholder value based on the field format */
  private getPlaceholderForFormat(format: string): any {
    switch (format) {
      case 'email': return 'user@example.com';
      case 'uri': return 'https://example.com/resource';
      case 'phone': return '+1-555-0100';
      default: return 'value';
    }
  }

  /**
   * Merge a SCIM attribute path into the current request body JSON.
   * Handles dot-notation (name.givenName) and array notation (emails[0].value).
   */
  private mergeScimAttribute(attrPath: string, format: string) {
    const placeholder = this.getPlaceholderForFormat(format);
    this.mergeScimAttributeWithValue(attrPath, placeholder);
  }

  /** Merge a SCIM attribute path with an explicit value. */
  private mergeScimAttributeWithValue(attrPath: string, value: any) {
    let body: any;
    try {
      body = JSON.parse(this.requestBody());
    } catch {
      body = {};
    }

    this.setNestedValue(body, attrPath, value);

    // If this is an extension URN path, ensure the schemas array includes the extension URN
    const parsed = this.parseScimPath(attrPath);
    if (parsed.length > 1 && parsed[0].key.startsWith('urn:')) {
      const extensionUrn = parsed[0].key;
      if (!body.schemas) body.schemas = [];
      if (!body.schemas.includes(extensionUrn)) {
        body.schemas.push(extensionUrn);
      }
    }

    this.requestBody.set(JSON.stringify(body, null, 2));
  }

  /** Remove a SCIM attribute path from the current request body JSON. */
  private removeScimAttribute(attrPath: string) {
    let body: any;
    try {
      body = JSON.parse(this.requestBody());
    } catch { return; }

    this.deleteNestedValue(body, attrPath);

    // If this was an extension URN path, clean up schemas array if the extension object is now empty
    const parsed = this.parseScimPath(attrPath);
    if (parsed.length > 1 && parsed[0].key.startsWith('urn:')) {
      const extensionUrn = parsed[0].key;
      const extObj = body[extensionUrn];
      if (!extObj || (typeof extObj === 'object' && Object.keys(extObj).length === 0)) {
        delete body[extensionUrn];
        if (Array.isArray(body.schemas)) {
          body.schemas = body.schemas.filter((s: string) => s !== extensionUrn);
        }
      }
    }

    this.requestBody.set(JSON.stringify(body, null, 2));
  }

  /**
   * Set a value at a SCIM attribute path like:
   *   "userName" → body.userName
   *   "name.givenName" → body.name.givenName
   *   "emails[0].value" → body.emails[0].value
   *   "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User.department" → body["urn:..."].department
   * Only sets if value doesn't already exist (non-destructive merge).
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const segments = this.parseScimPath(path);
    let current = obj;

    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (seg.index !== undefined) {
        // Array segment
        if (!Array.isArray(current[seg.key])) {
          current[seg.key] = [];
        }
        while (current[seg.key].length <= seg.index) {
          current[seg.key].push({});
        }
        current = current[seg.key][seg.index];
      } else {
        if (current[seg.key] === undefined || current[seg.key] === null) {
          current[seg.key] = {};
        }
        current = current[seg.key];
      }
    }

    const last = segments[segments.length - 1];
    if (last.index !== undefined) {
      if (!Array.isArray(current[last.key])) {
        current[last.key] = [];
      }
      while (current[last.key].length <= last.index) {
        current[last.key].push(value);
      }
      if (current[last.key][last.index] === undefined || current[last.key][last.index] === null || (typeof current[last.key][last.index] === 'object' && Object.keys(current[last.key][last.index]).length === 0)) {
        current[last.key][last.index] = value;
      }
    } else {
      // Only set if not already present (non-destructive)
      if (current[last.key] === undefined || current[last.key] === null) {
        current[last.key] = value;
      }
    }
  }

  private deleteNestedValue(obj: any, path: string): void {
    const segments = this.parseScimPath(path);
    let current = obj;

    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (seg.index !== undefined) {
        if (!Array.isArray(current[seg.key]) || current[seg.key].length <= seg.index) return;
        current = current[seg.key][seg.index];
      } else {
        if (current[seg.key] === undefined) return;
        current = current[seg.key];
      }
    }

    const last = segments[segments.length - 1];
    if (last.index !== undefined) {
      if (Array.isArray(current[last.key])) {
        current[last.key].splice(last.index, 1);
        if (current[last.key].length === 0) delete current[last.key];
      }
    } else {
      delete current[last.key];
    }
  }

  /**
   * Parse a SCIM attribute path into segments.
   * "emails[0].value" → [{key:"emails", index:0}, {key:"value"}]
   * "name.givenName" → [{key:"name"}, {key:"givenName"}]
   * "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department"
   *   → [{key:"urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"}, {key:"department"}]
   * "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager.value"
   *   → [{key:"urn:..."}, {key:"manager"}, {key:"value"}]
   */
  private parseScimPath(path: string): { key: string; index?: number }[] {
    const segments: { key: string; index?: number }[] = [];
    let remaining: string;

    if (path.startsWith('urn:')) {
      // URN-prefixed path: find where the schema URN ends and the attribute begins.
      // SCIM resource types start with uppercase (User, Group, Schema, etc.).
      // Split by ':' and scan backwards for the last uppercase-starting segment (resource type).
      // Everything up to and including that segment is the schema URN.
      const colonParts = path.split(':');
      let urnEndIndex = -1;
      for (let i = colonParts.length - 1; i >= 0; i--) {
        if (/^[A-Z]/.test(colonParts[i])) {
          urnEndIndex = i;
          break;
        }
      }

      if (urnEndIndex >= 0 && urnEndIndex < colonParts.length - 1) {
        // Found boundary: URN ends at resource type, attribute path follows
        segments.push({ key: colonParts.slice(0, urnEndIndex + 1).join(':') });
        // Remaining parts joined by ':' then split by '.' for sub-attributes
        // e.g. "department" or "manager.value" (the ':' between them is just one attr name)
        remaining = colonParts.slice(urnEndIndex + 1).join(':');
      } else {
        // No clear boundary — treat entire path as a single key
        remaining = path;
      }
    } else {
      remaining = path;
    }

    // Split by '.' and handle array indices
    const parts = remaining.split('.');
    for (const part of parts) {
      const arrMatch = part.match(/^(.+)\[(\d+)\]$/);
      if (arrMatch) {
        segments.push({ key: arrMatch[1], index: parseInt(arrMatch[2], 10) });
      } else {
        segments.push({ key: part });
      }
    }

    return segments;
  }
}
