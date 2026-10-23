import { hostText } from '../../shared/i18n';
import os from 'node:os';
import { isIPv4 } from 'node:net';
import type { IncomingMessage } from 'node:http';
import type { ConnectionScope } from '../../shared/automation';

function hostname(value: string): string | undefined {
  const name = value.toLowerCase().replace(/\.$/, '');
  if (
    !name ||
    name.length > 253 ||
    isIPv4(name) ||
    // Reject numeric/hex IP aliases as well as canonical IP literals.
    /^(?:0x[\da-f]+|\d+)(?:\.(?:0x[\da-f]+|\d+))*$/i.test(name) ||
    !name.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    return undefined;
  return name;
}

export function networkHostnames(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 16)
    throw Error(hostText('services.automationNetwork.hostnameLimit'));
  const names = value.map((entry) => (typeof entry === 'string' ? hostname(entry) : undefined));
  if (names.some((name) => !name))
    throw Error(hostText('services.automationNetwork.hostnameFormat'));
  return [...new Set(names as string[])];
}

export function networkAddresses(interfaces = os.networkInterfaces()): string[] {
  return [
    ...new Set(
      Object.values(interfaces).flatMap((items) =>
        (items ?? [])
          .filter((entry) => {
            if (entry.internal || entry.family !== 'IPv4' || !isIPv4(entry.address)) return false;
            const [a, b] = entry.address.split('.').map(Number);
            return a > 0 && a !== 127 && a < 224 && !(a === 169 && b === 254);
          })
          .map((entry) => entry.address),
      ),
    ),
  ].sort();
}

export function networkEndpointAddresses(interfaces = os.networkInterfaces()): string[] {
  // Hyper-V's default NAT gateway is not a useful LAN/tailnet connection suggestion.
  // Retain all adapter addresses for HTTP Host validation and direct connections.
  return networkAddresses(
    Object.fromEntries(
      Object.entries(interfaces).filter(([name]) => !/^vEthernet \(Default Switch\)$/i.test(name)),
    ),
  );
}

function authority(value: string): string | undefined {
  const match = /^([^:]+):([1-9]\d{0,4})$/.exec(value);
  if (!match || Number(match[2]) > 65535) return undefined;
  const name = isIPv4(match[1]) ? match[1] : hostname(match[1]);
  return name ? `${name}:${match[2]}` : undefined;
}

export function validMcpHeaders(
  req: Pick<IncomingMessage, 'headers' | 'rawHeaders'>,
  port: number,
  scope: ConnectionScope,
  extraNames: string[],
  addresses = networkAddresses(),
  machineName = os.hostname(),
): boolean {
  const counts = { host: 0, origin: 0, authorization: 0 };
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i].toLowerCase();
    if (Object.hasOwn(counts, name)) counts[name as keyof typeof counts]++;
  }
  if (counts.host !== 1 || counts.origin > 1 || counts.authorization > 1) return false;
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (typeof host !== 'string' || (origin !== undefined && typeof origin !== 'string'))
    return false;
  if (scope === 'local')
    return (
      host === `127.0.0.1:${port}` &&
      (origin === undefined || origin === `http://127.0.0.1:${port}`)
    );
  const parsed = authority(host);
  const allowed = ['127.0.0.1', ...addresses, hostname(machineName), ...extraNames];
  if (!parsed || !allowed.some((name) => name && parsed === `${name}:${port}`)) return false;
  return (
    origin === undefined || (origin.startsWith('http://') && authority(origin.slice(7)) === parsed)
  );
}

export function isLocalClient(address: string | undefined): boolean {
  return !!address && isIPv4(address) && address.startsWith('127.');
}
