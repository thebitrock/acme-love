import { describe, it, expect } from '@jest/globals';
// Updated to import from public entrypoint
import {
  createErrorFromProblem,
  CompoundError,
  IncorrectResponseError,
  ACME_ERROR,
} from '../../src/index.js';

/**
 * Tests for enhanced compound error mapping & formatting.
 */

describe('compound error fallback mapping', () => {
  const subproblems = [
    { type: ACME_ERROR.incorrectResponse, detail: 'resp mismatch 1' },
    { type: ACME_ERROR.incorrectResponse, detail: 'resp mismatch 2' },
  ];

  it('maps to CompoundError when explicit compound type present', () => {
    const err = createErrorFromProblem({
      type: ACME_ERROR.compound,
      detail: 'Errors during validation',
      subproblems,
    });
    expect(err).toBeInstanceOf(CompoundError);
    expect(err.subproblems).toHaveLength(2);
    expect(err.subproblems?.every((e) => e instanceof IncorrectResponseError)).toBe(true);
  });

  it('fallback maps to CompoundError when type missing but detail matches and has subproblems', () => {
    const err = createErrorFromProblem({
      // no type
      detail: 'Errors during validation',
      subproblems,
    });
    expect(err).toBeInstanceOf(CompoundError);
    expect(err.subproblems).toHaveLength(2);
  });

  it('fallback maps to CompoundError when type serverInternal but detail matches', () => {
    const err = createErrorFromProblem({
      type: ACME_ERROR.serverInternal,
      detail: 'Errors during validation',
      subproblems,
    });
    expect(err).toBeInstanceOf(CompoundError);
  });

  it('CompoundError toString lists subproblems', () => {
    const err = createErrorFromProblem({
      type: ACME_ERROR.compound,
      detail: 'Errors during validation',
      subproblems,
    });
    const txt = err.toString();
    expect(txt).toMatch(/Errors during validation/);
    expect(txt).toMatch(/1\. \[/); // enumerated list
    expect(txt).toMatch(/2\. \[/);
  });

  it('preserves constructor name in err.name', () => {
    const err = createErrorFromProblem({
      type: ACME_ERROR.compound,
      detail: 'Errors during validation',
      subproblems,
    });
    expect(err.name).toBe('CompoundError');
  });
});
