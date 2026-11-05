import { hostText } from './i18n';
import { localizedMetadata } from './translation-metadata';
export const updateCommands = localizedMetadata(
  () =>
    [
      {
        id: 'appdock.updates.installAll',
        title: hostText('commands.updates.installAll'),
        description: hostText('commands.updates.installAllDescription'),
        scope: 'all',
      },
      {
        id: 'appdock.updates.installHost',
        title: hostText('commands.updates.installHost'),
        description: hostText('commands.updates.installHostDescription'),
        scope: 'host',
      },
      {
        id: 'appdock.updates.check',
        title: hostText('commands.updates.check'),
        description: hostText('commands.updates.checkDescription'),
        scope: 'check',
      },
    ] as const,
);
