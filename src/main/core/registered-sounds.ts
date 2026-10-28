import { hostText } from '../../shared/i18n';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readWave } from './sounds';

export function soundFilename(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 180 &&
    !/[\\/:*?"<>|\x00-\x1f\x7f]/.test(value) &&
    !/[. ]$/.test(value) &&
    !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value) &&
    path.extname(value).toLowerCase() === '.wav'
  );
}

export class RegisteredSounds {
  constructor(readonly directory: string) {}
  private async safe() {
    await fs.mkdir(this.directory, { recursive: true });
    const actual = await fs.realpath(this.directory);
    if (
      actual.toLowerCase() !== path.resolve(this.directory).toLowerCase() ||
      (await fs.lstat(this.directory)).isSymbolicLink()
    )
      throw Error(hostText('services.registeredSounds.redirectedDirectory'));
  }
  async list(): Promise<string[]> {
    await this.safe();
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && soundFilename(e.name))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, 'ja'));
  }
  async resolve(name: unknown) {
    if (!soundFilename(name)) throw Error(hostText('services.registeredSounds.invalidFilename'));
    const canonical = (await this.list()).find((n) => n.toLowerCase() === name.toLowerCase());
    if (!canonical) throw Error(hostText('services.registeredSounds.missing'));
    const file = path.join(this.directory, canonical);
    if ((await fs.lstat(file)).isSymbolicLink())
      throw Error(hostText('services.registeredSounds.link'));
    await readWave(file);
    return file;
  }
  async add(source: string, filename = path.basename(source)) {
    if (!soundFilename(filename)) throw Error(hostText('services.registeredSounds.invalidName'));
    const bytes = await readWave(source);
    await this.safe();
    const existing = (await this.list()).find((n) => n.toLowerCase() === filename.toLowerCase());
    const name = existing ?? filename;
    const file = path.join(this.directory, name);
    const duplicate = async () => {
      const saved = await readWave(await this.resolve(name));
      if (!saved.equals(bytes))
        throw Error(hostText('services.registeredSounds.duplicateName', { name: String(name) }));
      return name;
    };
    if (existing) return duplicate();
    let handle;
    try {
      handle = await fs.open(file, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return duplicate();
      throw error;
    }
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (error) {
      await handle.close();
      await fs.unlink(file);
      throw error;
    }
    await handle.close();
    return name;
  }
}
