import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
// smol-toml exports a CJS build, but shares its ESM declaration file.
const { parse }: { parse(text: string): Record<string, unknown> } = require('smol-toml');
import { atomicWrite } from './settings';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export function codexServerName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value)
  )
    throw Error(hostText('services.codexRegistration.invalidName'));
  return value;
}
function blockName(block: string): string {
  const names = Object.keys(parsed(block).mcp_servers ?? {});
  if (names.length !== 1) throw Error(hostText('services.codexRegistration.invalidScope'));
  return codexServerName(names[0]);
}
export function codexConfigPath(file: unknown): string {
  if (
    typeof file !== 'string' ||
    !path.isAbsolute(file) ||
    path.basename(file).toLowerCase() !== 'config.toml'
  )
    throw Error(hostText('services.codexRegistration.absolutePathRequired'));
  return path.resolve(file);
}
function read(file: string) {
  if (!fs.existsSync(file)) return '';
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024)
    throw Error(hostText('services.codexRegistration.unsafeFile'));
  return fs.readFileSync(file, 'utf8');
}
function parsed(text: string): any {
  try {
    return parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw Error(hostText('services.codexRegistration.invalidToml'));
  }
}
function range(text: string, id: string) {
  const start = `# BEGIN AppDock MCP ${id}`;
  const end = `# END AppDock MCP ${id}`;
  const a = text.indexOf(start),
    b = text.indexOf(end);
  if (a < 0 && b < 0) return null;
  if (
    a < 0 ||
    b < a ||
    text.indexOf(start, a + start.length) >= 0 ||
    text.indexOf(end, b + end.length) >= 0 ||
    (a > 0 && text[a - 1] !== '\n')
  )
    throw Error(hostText('services.codexRegistration.scopeChanged'));
  let finish = b + end.length;
  if (text.slice(finish, finish + 2) === '\r\n') finish += 2;
  else if (text[finish] === '\n') finish++;
  return { a, b: finish, block: text.slice(a, finish) };
}
// An external uninstall may leave one delimiter comment after deleting the table.
// Remove only that standalone comment, with recorded ownership and identical TOML values.
function removedRegistration(text: string, id: string, name: string, ownedHash?: string) {
  if (!ownedHash) return text;
  const start = '# BEGIN AppDock MCP ' + id;
  const end = '# END AppDock MCP ' + id;
  const a = text.indexOf(start),
    b = text.indexOf(end);
  if ((a < 0 && b < 0) || (a >= 0 && b >= 0)) return text;
  const marker = a >= 0 ? start : end;
  const at = a >= 0 ? a : b;
  if ((at > 0 && text[at - 1] !== '\n') || text.indexOf(marker, at + marker.length) >= 0)
    return text;
  let finish = at + marker.length;
  if (text.slice(finish, finish + 2) === '\r\n') finish += 2;
  else if (text[finish] === '\n') finish++;
  else if (finish !== text.length) return text;
  const config = parsed(text);
  if (config.mcp_servers?.[name] !== undefined) return text;
  const without = text.slice(0, at) + text.slice(finish);
  return isDeepStrictEqual(config, parsed(without)) ? without : text;
}
export function registrationBlock(id: string, endpoint: string, token: string, name = 'AppDock') {
  codexServerName(name);
  if (
    !/^appdock_[a-f0-9]{16}$/.test(id) ||
    !/^http:\/\/127\.0\.0\.1:\d+\/mcp$/.test(endpoint) ||
    !/^[a-f0-9]{64}$/.test(token)
  )
    throw Error(hostText('services.codexRegistration.invalidRegistration'));
  return `# BEGIN AppDock MCP ${id}\n[mcp_servers.${name}]\nurl = "${endpoint}"\nenabled = true\nrequired = false\nhttp_headers = { Authorization = "Bearer ${token}" }\n# END AppDock MCP ${id}\n`;
}
export function registrationStatus(
  file: string,
  id: string,
  expectedBlock: string,
  ownedHash?: string,
) {
  try {
    const name = blockName(expectedBlock),
      text = removedRegistration(read(codexConfigPath(file)), id, name, ownedHash),
      config = parsed(text),
      r = range(text, id);
    if (!r && !config.mcp_servers?.[name]) return { registration: 'absent' as const };
    if (
      r &&
      r.block === expectedBlock &&
      isDeepStrictEqual(config.mcp_servers?.[name], parsed(expectedBlock).mcp_servers[name])
    )
      return { registration: 'registered' as const };
    return {
      registration: 'conflict' as const,
      registrationError:
        r && hash(r.block) === ownedHash
          ? blockName(r.block) !== name
            ? hostText('services.codexRegistration.nameChanged')
            : hostText('services.codexRegistration.repairRequired')
          : !r && config.mcp_servers?.[name]
            ? hostText('services.codexRegistration.nameConflict')
            : hostText('services.codexRegistration.registrationChanged'),
    };
  } catch (e) {
    return { registration: 'conflict' as const, registrationError: (e as Error).message };
  }
}
export function changeRegistration(
  file: string,
  id: string,
  block: string,
  ownedHash: string | undefined,
  remove = false,
) {
  file = codexConfigPath(file);
  const before = read(file),
    name = blockName(block),
    cleaned = removedRegistration(before, id, name, ownedHash),
    config = parsed(cleaned),
    r = range(cleaned, id);
  if (r && r.block !== block && hash(r.block) !== ownedHash)
    throw Error(hostText('services.codexRegistration.externallyChanged'));
  if (remove && !r && cleaned === before) return undefined;
  const previousName = r ? blockName(r.block) : undefined;
  if (!remove && previousName && previousName !== name)
    throw Error(hostText('services.codexRegistration.renameRequiresRemoval'));
  const without = r ? cleaned.slice(0, r.a) + cleaned.slice(r.b) : cleaned;
  // A marker inside a TOML string, or keys appended into our table, must not erase unrelated data.
  const stripped = parsed(without),
    expected = parsed(before);
  if (expected.mcp_servers) {
    if (previousName) delete expected.mcp_servers[previousName];
    if (!Object.keys(expected.mcp_servers).length) delete expected.mcp_servers;
  }
  if (stripped.mcp_servers && !Object.keys(stripped.mcp_servers).length)
    delete stripped.mcp_servers;
  if (!isDeepStrictEqual(expected, stripped))
    throw Error(hostText('services.codexRegistration.otherSettings'));
  if (!remove && stripped.mcp_servers?.[name])
    throw Error(hostText('services.codexRegistration.nameConflict'));
  const next = remove
    ? without
    : without + (without.endsWith('\n') || !without ? '' : '\n') + block;
  const nextConfig = parsed(next);
  if (
    !remove &&
    !isDeepStrictEqual(nextConfig.mcp_servers?.[name], parsed(block).mcp_servers[name])
  )
    throw Error(hostText('services.codexRegistration.registrationFailed'));
  if (read(file) !== before) throw Error(hostText('services.codexRegistration.settingsChanged'));
  // Preserve an exact recovery copy, never restore the entire file on unregister.
  if (before) atomicWrite(file + '.appdock-backup', before);
  atomicWrite(file, next);
  return remove ? undefined : hash(block);
}
