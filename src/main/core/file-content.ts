import fs, { type FileHandle } from 'node:fs/promises';
import { createHash } from 'node:crypto';

/** Read through a bounded buffer, detecting replacement or in-place writes during the read. */
export async function fileHash(file: string, active = () => true): Promise<string> {
  const handle = await fs.open(file, 'r');
  try {
    const before = await handle.stat();
    const hash = await handleHash(handle, active);
    const current = await fs.stat(file);
    if (
      current.ino !== before.ino ||
      current.dev !== before.dev ||
      current.size !== before.size ||
      current.mtimeMs !== before.mtimeMs ||
      current.ctimeMs !== before.ctimeMs
    )
      throw Error('File changed while reading');
    return hash;
  } finally {
    await handle.close();
  }
}
export async function handleHash(handle: FileHandle, active = () => true): Promise<string> {
  const before = await handle.stat();
  if (!before.isFile()) throw Error('Not a regular file');
  const hash = createHash('sha256'),
    buffer = Buffer.allocUnsafe(256 * 1024);
  let offset = 0;
  for (;;) {
    if (!active()) throw Error('File read cancelled');
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
    if (!bytesRead) break;
    hash.update(buffer.subarray(0, bytesRead));
    offset += bytesRead;
  }
  const after = await handle.stat();
  if (
    after.size !== before.size ||
    after.mtimeMs !== before.mtimeMs ||
    after.ctimeMs !== before.ctimeMs ||
    after.ino !== before.ino ||
    after.dev !== before.dev
  )
    throw Error('File changed while reading');
  if (offset !== before.size) throw Error('File changed while reading');
  return hash.digest('hex');
}

export async function sameFileHash(file: string, hash: string): Promise<boolean> {
  const stat = await fs.lstat(file);
  return stat.isFile() && !stat.isSymbolicLink() && (await fileHash(file)) === hash;
}
