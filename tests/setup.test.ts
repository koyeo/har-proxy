import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

describe('Project Setup', () => {
  it('should have vitest configured correctly', () => {
    expect(true).toBe(true);
  });

  it('should be able to import types', async () => {
    const types = await import('../src/types/index.js');
    expect(types).toBeDefined();
  });

  it('should have fast-check configured correctly', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
      { numRuns: 100 }
    );
  });
});
