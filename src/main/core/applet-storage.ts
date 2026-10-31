import path from 'node:path';
import { deviceName } from './device-settings';

export function appletStorageFile(
  root: string,
  owner: string,
  key: string,
  scope: unknown,
  machine: string,
) {
  if (scope !== undefined && scope !== 'device' && scope !== 'shared')
    throw Error('Invalid Storage scope');
  if (
    !/^[a-z0-9][a-z0-9.-]{0,100}$/.test(owner) ||
    !/^[a-zA-Z0-9._-]{1,100}$/.test(key) ||
    ['__proto__', 'constructor', 'prototype'].includes(key)
  )
    throw Error('Invalid Storage key');
  return scope === 'shared'
    ? path.join(root, 'storage', owner, 'shared', key + '.json')
    : path.join(root, 'storage', owner, 'devices', deviceName(machine), key + '.json');
}
