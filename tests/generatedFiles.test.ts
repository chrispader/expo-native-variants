import {mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {syncGeneratedFiles} from '../src/files/generated';

let root: string;
const state = '.generated.json';
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'native-variants-owned-'));
});
afterEach(async () => {
  await rm(root, {recursive: true, force: true});
});

describe('generated file ownership', () => {
  it('rejects unowned output before writing any replacement', async () => {
    await writeFile(path.join(root, 'icon.png'), 'user');
    await expect(
      syncGeneratedFiles(
        root,
        state,
        new Map([
          ['other.png', Buffer.from('new')],
          ['icon.png', Buffer.from('new')],
        ]),
      ),
    ).rejects.toThrow('unmodified generated file');
    await expect(stat(path.join(root, 'other.png'))).rejects.toHaveProperty('code', 'ENOENT');
  });

  it('removes stale generated files without removing neighboring user files', async () => {
    await syncGeneratedFiles(root, state, new Map([['old/icon.png', Buffer.from('old')]]));
    await writeFile(path.join(root, 'old/user.txt'), 'keep');
    await syncGeneratedFiles(root, state, new Map([['new/icon.png', Buffer.from('new')]]));
    await expect(stat(path.join(root, 'old/icon.png'))).rejects.toHaveProperty('code', 'ENOENT');
    expect(await readFile(path.join(root, 'old/user.txt'), 'utf8')).toBe('keep');
  });

  it('does not delete modified stale output', async () => {
    await syncGeneratedFiles(root, state, new Map([['icon.png', Buffer.from('old')]]));
    await writeFile(path.join(root, 'icon.png'), 'edited');
    await expect(syncGeneratedFiles(root, state, new Map())).rejects.toThrow(
      'unmodified generated file',
    );
  });

  it('rejects traversal and symlink paths', async () => {
    await expect(
      syncGeneratedFiles(root, state, new Map([['../escape', Buffer.from('x')]])),
    ).rejects.toThrow('Unsafe');
    await mkdir(path.join(root, 'real'));
    await symlink(path.join(root, 'real'), path.join(root, 'alias'));
    await expect(
      syncGeneratedFiles(root, state, new Map([['alias/icon.png', Buffer.from('x')]])),
    ).rejects.toThrow('symlink');
  });
});
