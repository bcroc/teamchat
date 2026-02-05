import { isAbsolute, relative, resolve } from 'path';

export function isPathWithin(basePath: string, targetPath: string): boolean {
  if (!isAbsolute(basePath) || !isAbsolute(targetPath)) {
    return false;
  }

  const normalizedBase = resolve(basePath);
  const normalizedTarget = resolve(targetPath);
  const relativePath = relative(normalizedBase, normalizedTarget);

  if (relativePath === '') {
    return true;
  }

  const separator = pathSeparator();
  const segments = relativePath.split(separator);
  const hasTraversal = segments.some((segment) => segment === '..');

  return !relativePath.startsWith('..') && !hasTraversal;
}

function pathSeparator(): string {
  return process.platform === 'win32' ? '\\' : '/';
}
