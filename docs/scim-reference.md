# SCIM 2.0 Quick Reference

A quick reference for the SCIM 2.0 protocol as it relates to SCIM Inspector.

---

## What is SCIM?

**System for Cross-domain Identity Management (SCIM)** is an open standard ([RFC 7642](https://tools.ietf.org/html/rfc7642), [RFC 7643](https://tools.ietf.org/html/rfc7643), [RFC 7644](https://tools.ietf.org/html/rfc7644)) for automating user provisioning between identity providers and applications.

---

## Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ServiceProviderConfig` | Server capabilities and supported features |
| GET | `/Schemas` | Available SCIM schemas (core + extensions) |
| GET | `/ResourceTypes` | Resource types supported (User, Group, etc.) |
| POST | `/Users` | Create a new user |
| GET | `/Users` | List users (supports filtering, pagination) |
| GET | `/Users/{id}` | Get a specific user |
| PUT | `/Users/{id}` | Full replacement update |
| PATCH | `/Users/{id}` | Partial update (add/replace/remove) |
| DELETE | `/Users/{id}` | Delete a user |
| POST | `/Groups` | Create a new group |
| GET | `/Groups` | List groups |
| GET | `/Groups/{id}` | Get a specific group |
| PUT | `/Groups/{id}` | Full replacement update |
| PATCH | `/Groups/{id}` | Partial update (add/replace/remove members) |
| DELETE | `/Groups/{id}` | Delete a group |

---

## Core User Schema

Schema URN: `urn:ietf:params:scim:schemas:core:2.0:User`

| Attribute | Type | Description |
|-----------|------|-------------|
| `userName` | String | Unique login identifier |
| `name.givenName` | String | First name |
| `name.familyName` | String | Last name |
| `name.formatted` | String | Full display name |
| `displayName` | String | Name shown in UIs |
| `emails[].value` | String | Email address |
| `emails[].type` | String | Email type (work, home) |
| `emails[].primary` | Boolean | Whether this is the primary email |
| `phoneNumbers[].value` | String | Phone number |
| `phoneNumbers[].type` | String | Phone type (work, mobile) |
| `title` | String | Job title |
| `active` | Boolean | Whether the user is active |
| `externalId` | String | ID in the external system |

---

## Enterprise Extension

Schema URN: `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User`

| Attribute | Type | Description |
|-----------|------|-------------|
| `employeeNumber` | String | Employee number |
| `costCenter` | String | Cost center name |
| `organization` | String | Organization name |
| `division` | String | Division name |
| `department` | String | Department name |
| `manager.value` | Reference | Manager's User ID |

### Using Extension Attributes in JSON

Extension attributes are namespaced under the schema URN:

```json
{
  "schemas": [
    "urn:ietf:params:scim:schemas:core:2.0:User",
    "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User"
  ],
  "userName": "john@example.com",
  "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
    "department": "Engineering",
    "manager": {
      "value": "manager-uuid-here"
    }
  }
}
```

---

## SCIM PATCH Operations

PATCH requests use a specific format:

```json
{
  "schemas": ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
  "Operations": [
    {
      "op": "replace",
      "path": "displayName",
      "value": "New Name"
    },
    {
      "op": "add",
      "path": "emails[type eq \"work\"].value",
      "value": "new@example.com"
    },
    {
      "op": "remove",
      "path": "phoneNumbers[type eq \"mobile\"]"
    }
  ]
}
```

---

## Filtering

SCIM supports filtering with these operators:

| Operator | Example |
|----------|---------|
| `eq` | `filter=userName eq "john"` |
| `ne` | `filter=active ne false` |
| `co` | `filter=displayName co "John"` |
| `sw` | `filter=userName sw "j"` |
| `ew` | `filter=email ew "@example.com"` |
| `gt`, `ge`, `lt`, `le` | `filter=meta.lastModified gt "2024-01-01"` |

### Pagination

| Parameter | Description |
|-----------|-------------|
| `startIndex` | 1-based index of the first result |
| `count` | Number of results per page |
| `sortBy` | Attribute to sort by |
| `sortOrder` | `ascending` (default) or `descending` |

---

## Further Reading

- [RFC 7642 — SCIM Definitions, Overview, Concepts](https://tools.ietf.org/html/rfc7642)
- [RFC 7643 — SCIM Core Schema](https://tools.ietf.org/html/rfc7643)
- [RFC 7644 — SCIM Protocol](https://tools.ietf.org/html/rfc7644)
- [SCIM 2.0 Tutorial (SimpleCloud)](https://simplecloud.info/)
