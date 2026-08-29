/**
 * Validation category keys and their display labels.
 *
 * The backend stores the snake_case key in `ValidationSummary.categories[].name`,
 * so anything rendering a stored run has to map it back — otherwise the UI
 * shows `patch_operations` where it means "PATCH Operations".
 */
export const VALIDATION_CATEGORIES: { key: string; label: string }[] = [
  { key: 'schema_discovery', label: 'Schema Discovery' },
  { key: 'users_crud', label: 'Users CRUD' },
  { key: 'groups_crud', label: 'Groups CRUD' },
  { key: 'patch_operations', label: 'PATCH Operations' },
  { key: 'filtering_pagination', label: 'Filtering & Pagination' },
  { key: 'duplicate_detection', label: 'Duplicate Detection (409)' },
  { key: 'soft_delete', label: 'Soft Delete (active=false)' },
  { key: 'group_operations', label: 'Group PATCH & Membership' },
  { key: 'field_mapping', label: 'Field Mapping Rules' },
  { key: 'custom_schema', label: 'Custom Schema Properties' },
];

const BY_KEY = new Map(VALIDATION_CATEGORIES.map((c) => [c.key, c.label]));

/**
 * Human label for a category. Unknown keys — a category added to the backend
 * before this list catches up — are title-cased rather than shown raw.
 */
export function categoryLabel(key: string): string {
  const known = BY_KEY.get(key);
  if (known) return known;

  // Already a display label (older runs stored these) — leave it alone.
  if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(key)) return key;

  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
