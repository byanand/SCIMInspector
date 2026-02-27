import { Injectable, inject, signal, computed } from '@angular/core';
import { TauriService } from './tauri.service';

/**
 * Global singleton that manages SCIM schema fetching, caching, and
 * Monaco JSON-Schema IntelliSense registration.
 *
 * Architecture:
 *  - Schemas are fetched once per server selection (auto + manual refresh).
 *  - Raw SCIM schemas are converted to JSON Schema draft-07 objects.
 *  - Separate JSON Schemas are built for User, Group, and PatchOp.
 *  - Each Monaco editor uses a unique model URI (e.g. scim://sample-data/user.json).
 *  - fileMatch patterns route the correct schema to each editor automatically.
 *  - Future screens (Explorer, Validation, etc.) register their URIs via addFileMatch().
 */
@Injectable({ providedIn: 'root' })
export class ScimSchemaService {
  private tauriService = inject(TauriService);

  // ── Public signals ──
  schemaStatus = signal<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  schemaCount = signal(0);
  errorMessage = signal('');

  // Raw SCIM schema objects from the server
  rawSchemas = signal<any[]>([]);

  // Tracks which server the schemas were loaded for
  private loadedForServerId = signal<string | null>(null);

  // ── fileMatch registrations per schema type ──
  private userFileMatches = signal<string[]>(['scim://sample-data/user.json']);
  private groupFileMatches = signal<string[]>(['scim://sample-data/group.json']);
  private patchOpFileMatches = signal<string[]>(['scim://explorer/patchop.json']);

  // Track whether Monaco schemas need re-registration
  private monacoRegistered = false;

  // ── Computed JSON Schemas ──

  /** JSON Schema for SCIM User resources (core + extensions from server) */
  userJsonSchema = computed(() => {
    const raw = this.rawSchemas();
    return this.buildJsonSchema(raw, 'User');
  });

  /** JSON Schema for SCIM Group resources (core + extensions from server) */
  groupJsonSchema = computed(() => {
    const raw = this.rawSchemas();
    return this.buildJsonSchema(raw, 'Group');
  });

  /** JSON Schema for SCIM PatchOp */
  patchOpJsonSchema: any = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'SCIM PatchOp',
    description: 'SCIM 2.0 Patch Operation (RFC 7644 §3.5.2)',
    type: 'object',
    required: ['schemas', 'Operations'],
    properties: {
      schemas: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
        },
        description: 'Must contain "urn:ietf:params:scim:api:messages:2.0:PatchOp"',
      },
      Operations: {
        type: 'array',
        description: 'One or more patch operations to apply',
        items: {
          type: 'object',
          required: ['op'],
          properties: {
            op: {
              type: 'string',
              enum: ['add', 'remove', 'replace'],
              description: 'The operation to perform',
            },
            path: {
              type: 'string',
              description: 'Attribute path to target (e.g. "displayName", "emails[type eq \\"work\\"].value", "members")',
            },
            value: {
              description: 'The value to set. Type depends on the target attribute.',
            },
          },
        },
      },
    },
    additionalProperties: false,
  };

  // ── Public methods ──

  /**
   * Fetch raw SCIM schemas from the server via Tauri.
   * Updates rawSchemas signal ➜ triggers JSON Schema recomputation ➜ re-registers Monaco schemas.
   */
  async fetchSchemas(serverConfigId: string): Promise<void> {
    // Don't re-fetch for the same server
    if (this.loadedForServerId() === serverConfigId && this.schemaStatus() === 'loaded') {
      return;
    }

    this.schemaStatus.set('loading');
    this.errorMessage.set('');

    try {
      const schemas = await this.tauriService.fetchScimSchemas(serverConfigId);
      this.rawSchemas.set(schemas);
      this.loadedForServerId.set(serverConfigId);
      this.schemaCount.set(schemas.length);
      this.schemaStatus.set('loaded');
      // Re-register Monaco schemas with updated data
      this.registerMonacoSchemas();
    } catch (err: any) {
      // If server fetch fails, still set loaded with core-only schemas
      this.rawSchemas.set([]);
      this.loadedForServerId.set(serverConfigId);
      this.schemaCount.set(0);
      this.errorMessage.set(err?.message || String(err));
      this.schemaStatus.set('error');
      // Still register core schemas so IntelliSense works
      this.registerMonacoSchemas();
    }
  }

  /** Force re-fetch schemas for the current server. */
  async refreshSchemas(): Promise<void> {
    const serverId = this.loadedForServerId();
    if (!serverId) return;
    this.loadedForServerId.set(null); // Clear so fetchSchemas doesn't skip
    await this.fetchSchemas(serverId);
  }

  /** Reset state when no server is selected. */
  reset(): void {
    this.rawSchemas.set([]);
    this.loadedForServerId.set(null);
    this.schemaStatus.set('idle');
    this.schemaCount.set(0);
    this.errorMessage.set('');
    this.registerMonacoSchemas();
  }

  /**
   * Register additional fileMatch URIs so future screens get IntelliSense automatically.
   * Example: scimSchemaService.addFileMatch('user', 'scim://explorer/user.json')
   */
  addFileMatch(schemaType: 'user' | 'group' | 'patchop', uri: string): void {
    if (schemaType === 'user') {
      const current = this.userFileMatches();
      if (!current.includes(uri)) {
        this.userFileMatches.set([...current, uri]);
        this.registerMonacoSchemas();
      }
    } else if (schemaType === 'group') {
      const current = this.groupFileMatches();
      if (!current.includes(uri)) {
        this.groupFileMatches.set([...current, uri]);
        this.registerMonacoSchemas();
      }
    } else if (schemaType === 'patchop') {
      const current = this.patchOpFileMatches();
      if (!current.includes(uri)) {
        this.patchOpFileMatches.set([...current, uri]);
        this.registerMonacoSchemas();
      }
    }
  }

  /**
   * Helper for components to get a Monaco model URI.
   * @param page - Page identifier (e.g. 'sample-data', 'explorer')
   * @param type - Resource type (e.g. 'user', 'group', 'patchop')
   */
  getModelUri(page: string, type: string): string {
    return `scim://${page}/${type}.json`;
  }

  /**
   * Call monaco.languages.json.jsonDefaults.setDiagnosticsOptions().
   * Safe to call repeatedly — idempotent. Must be called after Monaco is loaded.
   */
  registerMonacoSchemas(): void {
    const monaco = (window as any).monaco;
    if (!monaco?.languages?.json?.jsonDefaults) {
      // Monaco not loaded yet — will be called again from component onMonacoInit
      return;
    }

    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      enableSchemaRequest: false,
      schemas: [
        {
          uri: 'http://scim-inspector/user-schema.json',
          fileMatch: [...this.userFileMatches()],
          schema: this.userJsonSchema(),
        },
        {
          uri: 'http://scim-inspector/group-schema.json',
          fileMatch: [...this.groupFileMatches()],
          schema: this.groupJsonSchema(),
        },
        {
          uri: 'http://scim-inspector/patchop-schema.json',
          fileMatch: [...this.patchOpFileMatches()],
          schema: this.patchOpJsonSchema,
        },
      ],
    });
    this.monacoRegistered = true;
  }

  // ── Private: SCIM → JSON Schema converter ──

  /**
   * Build a JSON Schema draft-07 object for a given SCIM resource type.
   * Merges hardcoded core schema with any server-fetched extension schemas.
   */
  private buildJsonSchema(serverSchemas: any[], resourceType: 'User' | 'Group'): any {
    const coreSchema = resourceType === 'User'
      ? this.getCoreUserSchema()
      : this.getCoreGroupSchema();

    // Find server-provided core schema to augment/override
    const coreUrn = `urn:ietf:params:scim:schemas:core:2.0:${resourceType}`;
    const serverCoreSchema = serverSchemas.find((s: any) => s.id === coreUrn);

    if (serverCoreSchema?.attributes) {
      // Merge server-provided core attributes into the hardcoded schema
      const serverProps = this.scimAttributesToJsonSchema(serverCoreSchema.attributes);
      Object.assign(coreSchema.properties, serverProps);
    }

    // Find extension schemas that apply to this resource type
    const extensionSchemas = serverSchemas.filter((s: any) => {
      const id = s.id || '';
      // Skip core and API message schemas
      if (id.startsWith('urn:ietf:params:scim:schemas:core:2.0:') ||
          id.startsWith('urn:ietf:params:scim:api:messages:2.0:')) {
        return false;
      }
      // Heuristic: include if schema name/id contains the resource type, or
      // if it's a generic extension (doesn't mention another type)
      const idLower = id.toLowerCase();
      const nameLower = (s.name || '').toLowerCase();
      const typeLower = resourceType.toLowerCase();
      const otherType = resourceType === 'User' ? 'group' : 'user';
      if (idLower.includes(typeLower) || nameLower.includes(typeLower)) return true;
      if (!idLower.includes(otherType) && !nameLower.includes(otherType)) return true;
      return false;
    });

    // Add extension schemas as top-level properties keyed by URN
    const extensionUrns: string[] = [];
    for (const ext of extensionSchemas) {
      const extUrn = ext.id || '';
      if (!extUrn) continue;
      extensionUrns.push(extUrn);

      const extProps = ext.attributes
        ? this.scimAttributesToJsonSchema(ext.attributes)
        : {};

      coreSchema.properties[extUrn] = {
        type: 'object',
        description: ext.description || `Extension: ${ext.name || extUrn}`,
        properties: extProps,
        additionalProperties: true,
      };
    }

    // Update the schemas enum to include extension URNs
    const allUrns = [coreUrn, ...extensionUrns];
    coreSchema.properties.schemas = {
      type: 'array',
      description: 'The schema URNs that apply to this resource',
      items: {
        type: 'string',
        enum: allUrns,
      },
    };

    return coreSchema;
  }

  /**
   * Convert an array of SCIM schema attribute definitions to JSON Schema properties.
   */
  private scimAttributesToJsonSchema(attributes: any[]): Record<string, any> {
    const props: Record<string, any> = {};

    for (const attr of attributes) {
      const name = attr.name;
      if (!name) continue;

      const scimType = (attr.type || 'string').toLowerCase();
      const multiValued = attr.multiValued === true;
      const description = attr.description || '';
      const required = attr.required === true;
      const readOnly = attr.mutability === 'readOnly';

      let propSchema: any;

      if (scimType === 'complex') {
        // Complex attribute: has sub-attributes
        const subProps = attr.subAttributes
          ? this.scimAttributesToJsonSchema(attr.subAttributes)
          : {};
        propSchema = {
          type: 'object',
          description,
          properties: subProps,
          additionalProperties: true,
        };
      } else {
        propSchema = {
          type: this.scimTypeToJsonType(scimType),
          description,
        };
        if (scimType === 'reference') {
          propSchema.format = 'uri';
        }
        if (scimType === 'datetime') {
          propSchema.format = 'date-time';
        }
      }

      if (readOnly) {
        propSchema.readOnly = true;
      }

      if (multiValued) {
        props[name] = {
          type: 'array',
          description,
          items: propSchema,
        };
      } else {
        props[name] = propSchema;
      }
    }

    return props;
  }

  /** Map SCIM type to JSON Schema type. */
  private scimTypeToJsonType(scimType: string): string {
    switch (scimType) {
      case 'string': return 'string';
      case 'boolean': return 'boolean';
      case 'integer': return 'integer';
      case 'decimal': return 'number';
      case 'reference': return 'string';
      case 'datetime': return 'string';
      case 'binary': return 'string';
      default: return 'string';
    }
  }

  // ── Hardcoded SCIM Core Schemas (fallback) ──

  private getCoreUserSchema(): any {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'SCIM User',
      description: 'SCIM 2.0 User Resource (RFC 7643 §4.1)',
      type: 'object',
      required: ['schemas', 'userName'],
      properties: {
        schemas: {
          type: 'array',
          items: { type: 'string' },
          description: 'The schema URNs that apply to this resource',
        },
        id: {
          type: 'string',
          description: 'Unique identifier for the SCIM resource (assigned by the service provider)',
          readOnly: true,
        },
        externalId: {
          type: 'string',
          description: 'An identifier for the resource as defined by the provisioning client',
        },
        userName: {
          type: 'string',
          description: 'Unique identifier for the user, typically used to authenticate (RFC 7643 §4.1.1)',
        },
        name: {
          type: 'object',
          description: 'The components of the user\'s name (RFC 7643 §4.1.1)',
          properties: {
            formatted: { type: 'string', description: 'Full name, including titles and suffixes' },
            familyName: { type: 'string', description: 'Family name (last name)' },
            givenName: { type: 'string', description: 'Given name (first name)' },
            middleName: { type: 'string', description: 'Middle name(s)' },
            honorificPrefix: { type: 'string', description: 'Honorific prefix (e.g. "Ms.", "Dr.")' },
            honorificSuffix: { type: 'string', description: 'Honorific suffix (e.g. "Jr.", "III")' },
          },
          additionalProperties: true,
        },
        displayName: {
          type: 'string',
          description: 'The name of the user, suitable for display to end-users',
        },
        nickName: {
          type: 'string',
          description: 'The casual way to address the user',
        },
        profileUrl: {
          type: 'string',
          format: 'uri',
          description: 'URL pointing to the user\'s online profile',
        },
        title: {
          type: 'string',
          description: 'The user\'s title, such as "Vice President"',
        },
        userType: {
          type: 'string',
          description: 'Used to identify the relationship between the organization and the user (e.g. "Employee", "Contractor")',
        },
        preferredLanguage: {
          type: 'string',
          description: 'Preferred written or spoken language (BCP 47)',
        },
        locale: {
          type: 'string',
          description: 'The user\'s default location (BCP 47 language tag)',
        },
        timezone: {
          type: 'string',
          description: 'The user\'s time zone in IANA Time Zone database format (e.g. "America/Los_Angeles")',
        },
        active: {
          type: 'boolean',
          description: 'Whether the user account is active',
        },
        password: {
          type: 'string',
          description: 'The user\'s cleartext password (write-only, never returned)',
        },
        emails: {
          type: 'array',
          description: 'Email addresses for the user',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string', description: 'Email address value' },
              display: { type: 'string', description: 'Human-readable display value' },
              type: { type: 'string', description: 'Label: "work", "home", "other"', enum: ['work', 'home', 'other'] },
              primary: { type: 'boolean', description: 'Whether this is the primary email' },
            },
          },
        },
        phoneNumbers: {
          type: 'array',
          description: 'Phone numbers for the user',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string', description: 'Phone number value' },
              display: { type: 'string', description: 'Human-readable display value' },
              type: { type: 'string', description: 'Label: "work", "home", "mobile", "fax", "pager", "other"' },
              primary: { type: 'boolean', description: 'Whether this is the primary phone number' },
            },
          },
        },
        ims: {
          type: 'array',
          description: 'Instant messaging addresses for the user',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string', description: 'IM address value' },
              display: { type: 'string', description: 'Human-readable display value' },
              type: { type: 'string', description: 'Label: "aim", "gtalk", "icq", "xmpp", "msn", "skype", "qq", "yahoo"' },
              primary: { type: 'boolean' },
            },
          },
        },
        photos: {
          type: 'array',
          description: 'URLs of photos of the user',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string', format: 'uri', description: 'URL of the photo' },
              display: { type: 'string' },
              type: { type: 'string', description: '"photo" or "thumbnail"', enum: ['photo', 'thumbnail'] },
              primary: { type: 'boolean' },
            },
          },
        },
        addresses: {
          type: 'array',
          description: 'Physical mailing addresses for the user',
          items: {
            type: 'object',
            properties: {
              formatted: { type: 'string', description: 'Full mailing address' },
              streetAddress: { type: 'string', description: 'Street address component' },
              locality: { type: 'string', description: 'City or locality' },
              region: { type: 'string', description: 'State or region' },
              postalCode: { type: 'string', description: 'Zip code or postal code' },
              country: { type: 'string', description: 'Country (ISO 3166-1 alpha-2)' },
              type: { type: 'string', description: '"work", "home", "other"', enum: ['work', 'home', 'other'] },
              primary: { type: 'boolean' },
            },
          },
        },
        groups: {
          type: 'array',
          description: 'Groups the user belongs to (read-only)',
          readOnly: true,
          items: {
            type: 'object',
            properties: {
              value: { type: 'string', description: 'Group ID' },
              $ref: { type: 'string', format: 'uri', description: 'URI of the group' },
              display: { type: 'string', description: 'Group display name' },
              type: { type: 'string', description: '"direct" or "indirect"', enum: ['direct', 'indirect'] },
            },
          },
        },
        entitlements: {
          type: 'array',
          description: 'Entitlements for the user',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              display: { type: 'string' },
              type: { type: 'string' },
              primary: { type: 'boolean' },
            },
          },
        },
        roles: {
          type: 'array',
          description: 'Roles for the user',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              display: { type: 'string' },
              type: { type: 'string' },
              primary: { type: 'boolean' },
            },
          },
        },
        x509Certificates: {
          type: 'array',
          description: 'X.509 certificates for the user',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string', description: 'Base64-encoded DER certificate' },
              display: { type: 'string' },
              type: { type: 'string' },
              primary: { type: 'boolean' },
            },
          },
        },
        meta: {
          type: 'object',
          description: 'Resource metadata (read-only)',
          readOnly: true,
          properties: {
            resourceType: { type: 'string', description: 'The resource type name' },
            created: { type: 'string', format: 'date-time', description: 'When the resource was created' },
            lastModified: { type: 'string', format: 'date-time', description: 'When the resource was last modified' },
            location: { type: 'string', format: 'uri', description: 'The URI of the resource' },
            version: { type: 'string', description: 'The version (ETag) of the resource' },
          },
        },
      },
      additionalProperties: true,
    };
  }

  private getCoreGroupSchema(): any {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'SCIM Group',
      description: 'SCIM 2.0 Group Resource (RFC 7643 §4.2)',
      type: 'object',
      required: ['schemas', 'displayName'],
      properties: {
        schemas: {
          type: 'array',
          items: { type: 'string' },
          description: 'The schema URNs that apply to this resource',
        },
        id: {
          type: 'string',
          description: 'Unique identifier for the SCIM resource (assigned by the service provider)',
          readOnly: true,
        },
        externalId: {
          type: 'string',
          description: 'An identifier for the resource as defined by the provisioning client',
        },
        displayName: {
          type: 'string',
          description: 'A human-readable name for the group',
        },
        members: {
          type: 'array',
          description: 'Members of the group',
          items: {
            type: 'object',
            properties: {
              value: { type: 'string', description: 'Member resource ID' },
              $ref: { type: 'string', format: 'uri', description: 'URI of the member resource' },
              display: { type: 'string', description: 'Member display name' },
              type: { type: 'string', description: '"User" or "Group"', enum: ['User', 'Group'] },
            },
          },
        },
        meta: {
          type: 'object',
          description: 'Resource metadata (read-only)',
          readOnly: true,
          properties: {
            resourceType: { type: 'string', description: 'The resource type name' },
            created: { type: 'string', format: 'date-time', description: 'When the resource was created' },
            lastModified: { type: 'string', format: 'date-time', description: 'When the resource was last modified' },
            location: { type: 'string', format: 'uri', description: 'The URI of the resource' },
            version: { type: 'string', description: 'The version (ETag) of the resource' },
          },
        },
      },
      additionalProperties: true,
    };
  }
}
