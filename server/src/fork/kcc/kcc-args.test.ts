import { describe, expect, it } from 'vitest';

import type { KccOptionGroup } from '@bookorbit/types';

import { KCC_FIXED_ARGS, buildKccArgs, validateOptionValues } from './kcc-args';

const GROUPS: KccOptionGroup[] = [
  {
    title: 'MAIN',
    options: [
      { dest: 'profile', flags: ['-p', '--profile'], kind: 'str', default: 'KV', help: '' },
      { dest: 'righttoleft', flags: ['-m', '--manga-style'], kind: 'bool', default: false, help: '' },
      { dest: 'targetsize', flags: ['--ts', '--targetsize'], kind: 'int', default: null, help: '' },
    ],
  },
  {
    title: 'PROCESSING',
    options: [
      { dest: 'cropping', flags: ['-c', '--cropping'], kind: 'int', default: 2, help: '' },
      { dest: 'gamma', flags: ['-g', '--gamma'], kind: 'float', default: 0, help: '' },
      { dest: 'upscale', flags: ['-u', '--upscale'], kind: 'bool', default: false, help: '' },
      { dest: 'delete', flags: ['-d', '--delete'], kind: 'bool', default: false, help: '' },
    ],
  },
];

describe('buildKccArgs', () => {
  it('uses long flags, skips defaults and false booleans, and appends the fixed arguments', () => {
    const { args, ignored } = buildKccArgs({ profile: 'KoLC', righttoleft: true, upscale: false, cropping: 2, gamma: 1.8 }, GROUPS);
    expect(args).toEqual(['--profile', 'KoLC', '--manga-style', '--gamma', '1.8', ...KCC_FIXED_ARGS]);
    expect(ignored).toEqual([]);
  });

  it('leaves out options KCC no longer has and options BookOrbit manages', () => {
    const { args, ignored } = buildKccArgs({ removedOption: true, delete: true, targetsize: 50 }, GROUPS);
    expect(args).toEqual([...KCC_FIXED_ARGS]);
    expect(ignored).toEqual(['removedOption', 'delete', 'targetsize']);
  });

  it('ignores a non-integer value for an int option', () => {
    expect(buildKccArgs({ cropping: 1.5 }, GROUPS).ignored).toEqual(['cropping']);
  });

  it('always asks for one CBZ', () => {
    expect(KCC_FIXED_ARGS).toEqual(['--format', 'CBZ', '--batchsplit', '0', '--tempdir']);
  });
});

describe('validateOptionValues', () => {
  it('accepts plain values', () => {
    expect(validateOptionValues({ profile: 'KoLC', righttoleft: true, gamma: 1.8 })).toBeNull();
  });

  it('refuses managed options, odd names and nested values', () => {
    expect(validateOptionValues({ delete: true })).toBe('delete is set by BookOrbit');
    expect(validateOptionValues({ output: '/tmp' })).toBe('output is set by BookOrbit');
    expect(validateOptionValues({ '--profile': 'x' })).toMatch(/invalid option name/);
    expect(validateOptionValues({ profile: { a: 1 } })).toMatch(/invalid value/);
    expect(validateOptionValues([])).toBe('options must be an object');
  });
});
