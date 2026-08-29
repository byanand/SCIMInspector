import { describe, it, expect } from 'vitest';
import { groupFailures } from './failure-grouping';
import { ValidationResult } from '../models/interfaces';

let seq = 0;

function result(partial: Partial<ValidationResult>): ValidationResult {
  return {
    id: `r${seq++}`,
    test_run_id: 'run1',
    test_name: 'Test',
    category: 'Users CRUD',
    http_method: 'PATCH',
    url: '/Users/1',
    duration_ms: 100,
    passed: false,
    executed_at: '2026-08-28T14:02:00Z',
    ...partial,
  };
}

describe('groupFailures', () => {
  it('ignores passing tests', () => {
    const groups = groupFailures([
      result({ passed: true, failure_reason: undefined }),
      result({ passed: true }),
    ]);
    expect(groups).toEqual([]);
  });

  it('collapses one root cause across several tests', () => {
    // The point of triage: three failures, one thing to fix.
    const groups = groupFailures([
      result({
        test_name: 'Replace active',
        failure_reason: "op 'replace' requires a path for multi-valued attributes",
      }),
      result({
        test_name: 'Replace primary email',
        failure_reason: "op 'replace' requires a path for multi-valued attributes",
      }),
      result({
        test_name: 'Replace phoneNumbers[0].value',
        failure_reason: "op 'replace' requires a path for multi-valued attributes",
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].tests).toHaveLength(3);
    expect(groups[0].cause).toBe(
      'PATCH replace needs an explicit path on multi-valued attributes'
    );
    expect(groups[0].fix).toContain('path filter');
  });

  it('separates distinct causes and orders the largest first', () => {
    const groups = groupFailures([
      result({ failure_reason: '401 Unauthorized' }),
      result({ failure_reason: "op 'replace' requires a path" }),
      result({ failure_reason: "op 'replace' requires a path" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].tests).toHaveLength(2);
    expect(groups[0].cause).toContain('PATCH replace');
    expect(groups[1].cause).toBe('Authentication rejected by the server');
  });

  it('groups unrecognised reasons that differ only by their variable parts', () => {
    // No rule matches these, so they fall back to the normalised reason — the
    // ids and quoted values must not split one problem into three.
    const groups = groupFailures([
      result({ failure_reason: 'Attribute "costCenter" drifted after 3 retries' }),
      result({ failure_reason: 'Attribute "division" drifted after 7 retries' }),
      result({ failure_reason: 'Attribute "employeeNumber" drifted after 11 retries' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].tests).toHaveLength(3);
    // Without a matching rule there is no fix to offer, and none is invented.
    expect(groups[0].fix).toBe('');
  });

  it('keeps genuinely different unrecognised reasons apart', () => {
    const groups = groupFailures([
      result({ failure_reason: 'Response was not valid SCIM JSON' }),
      result({ failure_reason: 'Attribute drifted after retries' }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it('reads a 404 as a missing resource rather than a server fault', () => {
    const groups = groupFailures([result({ failure_reason: '404 Not Found' })]);
    expect(groups[0].cause).toBe('Resource was not found where the spec expects it');
  });

  it('prefers the more specific rule when several could match', () => {
    // Mentions both a path requirement and a 400; the PATCH-path rule is the
    // actionable one and is listed first.
    const groups = groupFailures([
      result({ failure_reason: "400 Bad Request: op 'replace' requires a path" }),
    ]);
    expect(groups[0].cause).toBe(
      'PATCH replace needs an explicit path on multi-valued attributes'
    );
  });

  it('handles a missing failure reason without dropping the test', () => {
    const groups = groupFailures([result({ failure_reason: undefined })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].tests).toHaveLength(1);
    expect(groups[0].cause).toBe('No failure reason recorded');
  });

  it('truncates a very long unrecognised reason used as a heading', () => {
    const groups = groupFailures([result({ failure_reason: 'x'.repeat(400) })]);
    expect(groups[0].cause.length).toBeLessThanOrEqual(120);
    expect(groups[0].cause.endsWith('…')).toBe(true);
  });
});
