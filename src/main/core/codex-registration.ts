import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
// smol-toml exports a CJS build, but shares its ESM declaration file.
const {
  parse,
  stringify,
}: {
  parse(text: string): Record<string, unknown>;
  stringify(value: Record<string, unknown>): string;
} = require('smol-toml');
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

// Only reserialize the owned server. Preserve tool policies, timeouts and custom headers,
// but remove alternate transports/credentials that would override the repaired connection.
function repairedServer(current: any, expected: any) {
  const record = (value: any) =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  current = record(current);
  const next = Object.assign(Object.create(null), current, expected);
  for (const key of [
    'command',
    'args',
    'env',
    'env_vars',
    'cwd',
    'experimental_environment',
    'bearer_token_env_var',
    'auth',
    'oauth',
  ])
    delete next[key];
  const headers = { ...record(current.http_headers) };
  for (const key of Object.keys(headers))
    if (key.toLowerCase() === 'authorization') delete headers[key];
  next.http_headers = Object.assign(Object.create(null), headers, expected.http_headers);
  if (current.env_http_headers) {
    next.env_http_headers = Object.assign(Object.create(null), record(current.env_http_headers));
    for (const key of Object.keys(next.env_http_headers))
      if (key.toLowerCase() === 'authorization') delete next.env_http_headers[key];
    if (!Object.keys(next.env_http_headers).length) delete next.env_http_headers;
  }
  return next;
}

// Codex can move http_headers and tool policies into separate TOML tables. Candidate
// sections are accepted only when deleting them changes exactly this server's value.
function serverSections(text: string, name: string) {
  const headers: { at: number; keys: string[] }[] = [];
  for (const match of text.matchAll(/^[\t ]*\[.*$/gm)) {
    const keys: string[] = [];
    try {
      let value: any = parse(match[0]);
      while (value && typeof value === 'object' && !Array.isArray(value)) {
        const names = Object.keys(value);
        if (names.length !== 1) break;
        keys.push(names[0]);
        value = value[names[0]];
      }
    } catch {
      /* A header-like line in a multiline string is still a boundary. */
    }
    headers.push({ at: match.index!, keys });
  }
  return headers.flatMap((header, index) => {
    if (header.keys[0] !== 'mcp_servers' || header.keys[1] !== name) return [];
    let end = headers[index + 1]?.at ?? text.length;
    // Trailing comments/blank lines may belong to the following registration.
    const lines = text.slice(header.at, end).match(/[^\n]*\n|[^\n]+$/g) ?? [];
    while (lines.length && (!lines.at(-1)!.trim() || lines.at(-1)!.trimStart().startsWith('#')))
      end -= lines.pop()!.length;
    return [{ a: header.at, b: end }];
  });
}

function registrationPlan(
  file: string,
  id: string,
  block: string,
  ownedHash: string | undefined,
  remove: boolean,
) {
  const before = read(codexConfigPath(file)),
    name = blockName(block),
    cleaned = removedRegistration(before, id, name, ownedHash),
    config = parsed(cleaned),
    r = range(cleaned, id),
    previousName = r ? blockName(r.block) : undefined;
  if (remove && !r && config.mcp_servers?.[name])
    throw Error(hostText('services.codexRegistration.nameConflict'));
  if (!remove && previousName && previousName !== name)
    throw Error(hostText('services.codexRegistration.renameRequiresRemoval'));
  const spans = r ? [{ a: r.a, b: r.b }, ...serverSections(cleaned, previousName!)] : [];
  spans.sort((a, b) => a.a - b.a);
  const merged: { a: number; b: number }[] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span.a <= last.b) last.b = Math.max(last.b, span.b);
    else merged.push({ ...span });
  }
  let without = cleaned;
  for (const span of merged.slice().reverse()) {
    const removed = cleaned.slice(span.a, span.b);
    for (const marker of removed.matchAll(/^[\t ]*# (?:BEGIN|END) AppDock MCP (\S+)/gm))
      if (marker[1] !== id) throw Error(hostText('services.codexRegistration.otherSettings'));
    without = without.slice(0, span.a) + without.slice(span.b);
  }
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
  const current = previousName ? config.mcp_servers[previousName] : undefined,
    desired = parsed(block).mcp_servers[name],
    complete = r && isDeepStrictEqual(parsed(r.block).mcp_servers[previousName!], current),
    changed =
      !!r &&
      !(complete && (r.block === block || hash(r.block) === ownedHash)) &&
      (previousName !== name || !isDeepStrictEqual(current, desired));
  if (changed && !ownedHash) throw Error(hostText('services.codexRegistration.externallyChanged'));
  const repaired = current ? repairedServer(current, desired) : desired,
    nextBlock = isDeepStrictEqual(repaired, desired)
      ? block
      : `# BEGIN AppDock MCP ${id}\n${stringify({ mcp_servers: { [name]: repaired } })}# END AppDock MCP ${id}\n`,
    next = remove
      ? without
      : without + (without.endsWith('\n') || !without ? '' : '\n') + nextBlock;
  const nextConfig = parsed(next);
  if (!remove && !isDeepStrictEqual(nextConfig.mcp_servers?.[name], repaired))
    throw Error(hostText('services.codexRegistration.registrationFailed'));
  return { before, next, nextBlock, changed, name: previousName ?? name, revision: hash(before) };
}

export function previewRegistrationChange(
  file: string,
  id: string,
  block: string,
  ownedHash: string | undefined,
  remove = false,
) {
  const plan = registrationPlan(file, id, block, ownedHash, remove);
  return { requiresConfirmation: plan.changed, name: plan.name, revision: plan.revision };
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
      blockName(r.block) === name &&
      isDeepStrictEqual(
        config.mcp_servers?.[name],
        repairedServer(config.mcp_servers?.[name], parsed(expectedBlock).mcp_servers[name]),
      )
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
  confirmedRevision?: string,
) {
  file = codexConfigPath(file);
  const plan = registrationPlan(file, id, block, ownedHash, remove);
  if (confirmedRevision !== undefined && confirmedRevision !== plan.revision)
    throw Error(hostText('services.codexRegistration.settingsChanged'));
  if (plan.changed && confirmedRevision === undefined)
    throw Error(hostText('services.codexRegistration.externallyChanged'));
  if (remove && plan.next === plan.before) return undefined;
  if (read(file) !== plan.before)
    throw Error(hostText('services.codexRegistration.settingsChanged'));
  // Preserve an exact recovery copy, never restore the entire file on unregister.
  if (plan.before) atomicWrite(file + '.appdock-backup', plan.before);
  atomicWrite(file, plan.next);
  return remove ? undefined : hash(plan.nextBlock);
}
