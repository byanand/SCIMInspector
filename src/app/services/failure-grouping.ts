import { ValidationResult } from '../models/interfaces';

export interface FailureGroup {
  /** Stable key for tracking in templates. */
  key: string;
  /** What went wrong, phrased as one root cause across every test in the group. */
  cause: string;
  /** What to do about it. Empty when no rule matched and only the raw reason is known. */
  fix: string;
  tests: ValidationResult[];
}

interface CauseRule {
  match: RegExp;
  cause: string;
  fix: string;
}

/**
 * Known SCIM failure shapes, most specific first.
 *
 * The point of triage is that eight failed tests are usually two or three
 * actual problems. Each rule turns a class of failure_reason strings into one
 * root cause plus the concrete change that resolves it.
 */
const RULES: CauseRule[] = [
  {
    match: /requires? a path|no path.*multi|path.*multi-?valued/i,
    cause: 'PATCH replace needs an explicit path on multi-valued attributes',
    fix: 'The server rejects a value-only replace. Send op "replace" with a path filter, e.g. emails[type eq "work"].value.',
  },
  {
    match: /\b401\b|unauthorized|invalid[_ ]token|authentication failed/i,
    cause: 'Authentication rejected by the server',
    fix: 'The credentials on this profile were refused. Re-check the token or key on the Servers screen, then run Test connection.',
  },
  {
    match: /\b403\b|forbidden|insufficient.*(scope|permission)/i,
    cause: 'Credentials lack permission for these operations',
    fix: 'The endpoint answered but refused the action. The service account needs SCIM write scope for Users and Groups.',
  },
  {
    match: /\b409\b|duplicate|uniqueness/i,
    cause: 'Duplicate detection did not behave as expected',
    fix: 'SCIM requires 409 with scimType "uniqueness" when a userName already exists. Check what this server returns instead.',
  },
  {
    match: /missing from response|attribute .* missing|not present in response/i,
    cause: 'Field mapping rule violated on a required attribute',
    fix: 'An attribute marked required in Field Mapping is absent from the response. Either relax the rule or map the extension attribute.',
  },
  {
    match: /expected \d+ results?|filter .* returned|active eq false/i,
    cause: 'Filtering returned the wrong result set',
    fix: 'The server did not honour the filter. Confirm it supports filtering on this attribute, and whether soft-deleted resources are excluded.',
  },
  {
    match: /\b501\b|not implemented|unsupported operation/i,
    cause: 'Operation is not implemented by this server',
    fix: 'The server reports it does not support this operation. Check /ServiceProviderConfig and deselect the category if it does not apply.',
  },
  {
    match: /\b5\d\d\b|internal server error/i,
    cause: 'Server returned a 5xx error',
    fix: 'These are faults on the server side, not protocol violations. Check the server logs for the matching request ids.',
  },
  {
    match: /timeout|timed out|deadline/i,
    cause: 'Requests timed out',
    fix: 'The server did not answer in time. Retry against a quieter endpoint, or check whether a rate limit is being hit.',
  },
  {
    match: /\b404\b|not found/i,
    cause: 'Resource was not found where the spec expects it',
    fix: 'A resource created earlier in the run could not be read back. This usually means the create response omitted an id or Location.',
  },
  {
    match: /\b400\b|bad request|invalid (syntax|filter|value)/i,
    cause: 'Server rejected the request as malformed',
    fix: 'The payload was refused before it was processed. Compare the request body against the attribute types in /Schemas.',
  },
];

const UNKNOWN_FIX = '';

/**
 * Collapses a failure reason to a grouping key by removing the parts that vary
 * per test — quoted values, ids, numbers and URNs — so that three tests failing
 * for one reason land in one group.
 */
function normalise(reason: string): string {
  return reason
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''")
    .replace(/urn:[\w:.]+/gi, 'urn')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, 'id')
    .replace(/\b\d+\b/g, 'n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function ruleFor(reason: string): CauseRule | null {
  return RULES.find((r) => r.match.test(reason)) ?? null;
}

/**
 * Groups failed validation results by root cause, worst-first.
 *
 * Results that match a known rule group by that rule; anything unrecognised
 * falls back to grouping on the normalised reason text, so novel failures still
 * collapse instead of listing one-by-one.
 */
export function groupFailures(results: ValidationResult[]): FailureGroup[] {
  const failures = results.filter((r) => !r.passed);
  const groups = new Map<string, FailureGroup>();

  for (const result of failures) {
    const reason = result.failure_reason?.trim() || 'No failure reason recorded';
    const rule = ruleFor(reason);
    const key = rule ? rule.cause : `raw:${normalise(reason)}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        cause: rule ? rule.cause : truncate(reason),
        fix: rule ? rule.fix : UNKNOWN_FIX,
        tests: [],
      };
      groups.set(key, group);
    }
    group.tests.push(result);
  }

  // Biggest cause first — it is the one worth fixing next.
  return [...groups.values()].sort((a, b) => b.tests.length - a.tests.length);
}

/** A cause used as a heading has to fit on one line. */
function truncate(reason: string, max = 120): string {
  return reason.length <= max ? reason : `${reason.slice(0, max - 1)}…`;
}
