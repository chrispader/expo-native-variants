import {createHash} from 'node:crypto';
import {lstat, mkdir, readFile, rmdir, unlink, writeFile} from 'node:fs/promises';
import path from 'node:path';

/** Reconcile only owned, unmodified files. Never delete a whole directory. */
export async function syncGeneratedFiles(
  root: string,
  stateName: string,
  files: ReadonlyMap<string, Buffer>,
): Promise<void> {
  const statePath = safePath(root, stateName);
  await assertNoSymlinks(root, statePath);
  const previous = await readState(statePath);
  for (const relative of new Set([...Object.keys(previous), ...files.keys()])) {
    const target = safePath(root, relative);
    await assertNoSymlinks(root, target);
    const contents = await readIfPresent(target);
    if (contents !== undefined && digest(contents) !== previous[relative]) {
      throw new Error(
        `expo-native-variants will not replace ${target}: it is not an unmodified generated file.`,
      );
    }
  }
  for (const relative of Object.keys(previous)) {
    if (files.has(relative)) {
      continue;
    }
    const target = safePath(root, relative);
    try {
      await unlink(target);
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) throw error;
    }
    await pruneEmptyParents(root, path.dirname(target));
  }
  const state: Record<string, string> = {};
  for (const [relative, contents] of files) {
    const target = safePath(root, relative);
    await mkdir(path.dirname(target), {recursive: true});
    await writeFile(target, contents);
    state[relative] = digest(contents);
  }
  if (files.size === 0 && Object.keys(previous).length === 0) return;
  await mkdir(root, {recursive: true});
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function readState(file: string): Promise<Record<string, string>> {
  const content = await readIfPresent(file);
  if (content === undefined) return {};
  const value: unknown = JSON.parse(content.toString('utf8'));
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.values(value).some((hash) => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))
  ) {
    throw new Error(`Invalid expo-native-variants generated file manifest: ${file}`);
  }
  return value as Record<string, string>;
}

function safePath(root: string, relative: string): string {
  if (
    path.isAbsolute(relative) ||
    relative.split(/[\\/]/).some((part) => part === '..' || part === '.' || part === '')
  ) {
    throw new Error(`Unsafe generated file path: ${relative}`);
  }
  return path.join(root, relative);
}

async function assertNoSymlinks(root: string, target: string): Promise<void> {
  for (
    let current = target;
    current.startsWith(`${root}${path.sep}`) || current === root;
    current = path.dirname(current)
  ) {
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error(`Refusing to write through symlink: ${current}`);
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) throw error;
    }
  }
}

async function readIfPresent(file: string): Promise<Buffer | undefined> {
  try {
    return await readFile(file);
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

async function pruneEmptyParents(root: string, directory: string): Promise<void> {
  if (directory === root) return;
  try {
    await rmdir(directory);
  } catch (error) {
    if (hasCode(error, 'ENOTEMPTY') || hasCode(error, 'ENOENT') || hasCode(error, 'EEXIST')) return;
    throw error;
  }
  await pruneEmptyParents(root, path.dirname(directory));
}

function digest(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
