export const updateCommands = [
  {
    id: 'appdock.updates.installAll',
    title: '本体と全Appletを更新',
    description: 'AppDockとすべてのAppletの更新を行います。',
    scope: 'all',
  },
  {
    id: 'appdock.updates.installHost',
    title: 'AppDockを更新',
    description: 'AppDockの更新を行います。',
    scope: 'host',
  },
  {
    id: 'appdock.updates.check',
    title: '更新チェック',
    description: 'AppDockとすべてのAppletの更新チェックを行います。',
    scope: 'check',
  },
] as const;
