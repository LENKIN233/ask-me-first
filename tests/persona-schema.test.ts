import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSONA_SEED,
  validatePersona,
  parsePersona,
  mergePersona,
} from '../src/persona/schema.ts';
import type { Persona } from '../src/persona/schema.ts';

describe('validatePersona', () => {
  it('accepts PERSONA_SEED', () => {
    assert.equal(validatePersona(PERSONA_SEED), null);
  });

  it('rejects null', () => {
    assert.ok(validatePersona(null) !== null);
  });

  it('rejects string', () => {
    assert.ok(validatePersona('hello') !== null);
  });

  it('rejects number', () => {
    assert.ok(validatePersona(42) !== null);
  });

  it('rejects array', () => {
    assert.ok(validatePersona([1, 2]) !== null);
  });

  it('rejects missing version', () => {
    const bad = { ...PERSONA_SEED, version: undefined };
    assert.ok(validatePersona(bad) !== null);
  });

  it('rejects negative version', () => {
    const bad = { ...PERSONA_SEED, version: -1 };
    assert.ok(validatePersona(bad) !== null);
  });

  it('rejects invalid voice.formality', () => {
    const bad = {
      ...PERSONA_SEED,
      voice: { ...PERSONA_SEED.voice, formality: 'extreme' },
    };
    assert.ok(validatePersona(bad) !== null);
  });

  it('rejects non-array judgment.autonomous_when', () => {
    const bad = {
      ...PERSONA_SEED,
      judgment: { ...PERSONA_SEED.judgment, autonomous_when: 'not-array' },
    };
    assert.ok(validatePersona(bad) !== null);
  });

  it('rejects invalid learning.maturity', () => {
    const bad = {
      ...PERSONA_SEED,
      learning: { ...PERSONA_SEED.learning, maturity: 'mega' },
    };
    assert.ok(validatePersona(bad) !== null);
  });
});

describe('parsePersona', () => {
  it('parses valid JSON string', () => {
    const json = JSON.stringify(PERSONA_SEED);
    const result = parsePersona(json);
    assert.equal(result.version, 1);
    assert.equal(result.voice.formality, 'medium');
  });

  it('returns seed on invalid JSON', () => {
    const result = parsePersona('{{bad json');
    assert.equal(result.version, PERSONA_SEED.version);
    assert.deepStrictEqual(result.voice.tone, PERSONA_SEED.voice.tone);
  });

  it('returns seed on invalid object', () => {
    const result = parsePersona({ broken: true } as any);
    assert.equal(result.version, PERSONA_SEED.version);
  });

  it('parses valid object input', () => {
    const result = parsePersona(PERSONA_SEED as any);
    assert.equal(result.summary, PERSONA_SEED.summary);
  });
});

describe('mergePersona', () => {
  it('applies voice updates', () => {
    const updated = mergePersona(PERSONA_SEED, {
      voice: { ...PERSONA_SEED.voice, verbosity: 'detailed' },
    });
    assert.equal(updated.voice.verbosity, 'detailed');
  });

  it('preserves unmodified fields', () => {
    const updated = mergePersona(PERSONA_SEED, {
      voice: { ...PERSONA_SEED.voice, verbosity: 'detailed' },
    });
    assert.equal(updated.summary, PERSONA_SEED.summary);
    assert.deepStrictEqual(updated.boundaries, PERSONA_SEED.boundaries);
  });

  it('respects locked_fields', () => {
    const base: Persona = {
      ...PERSONA_SEED,
      learning: { ...PERSONA_SEED.learning, locked_fields: ['voice'] },
    };
    const updated = mergePersona(base, {
      voice: { ...PERSONA_SEED.voice, verbosity: 'detailed' },
    });
    assert.equal(updated.voice.verbosity, 'brief');
  });

  it('does not overwrite version', () => {
    const updated = mergePersona(PERSONA_SEED, { version: 999 } as any);
    assert.equal(updated.version, 1);
  });

  it('does not overwrite learning', () => {
    const updated = mergePersona(PERSONA_SEED, {
      learning: { ...PERSONA_SEED.learning, maturity: 'stable' },
    } as any);
    assert.equal(updated.learning.maturity, 'seed');
  });
});
