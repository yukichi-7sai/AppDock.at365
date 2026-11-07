import type { NodeExtensionContext } from '../../../../src/main/node-worker';
export async function activate(context: NodeExtensionContext) {
  const refresh = async () =>
    context.storage.set(
      'fixture-state',
      { greeting: context.settings.get('greeting', '自分の道具を、ひとつの場所に。') },
      'memory',
    );
  context.commands.register('appdock.welcome.refresh', 'ウェルカムを更新', refresh);
  context.commands.register('appdock.welcome.notify', 'テスト通知を表示', () =>
    context.notifications.publish({
      typeId: 'fixture',
      title: 'AppDock.at365',
      body: '拡張からの通知が届きました。',
    }),
  );
  context.commands.register('appdock.welcome.verify-storage', '保存APIを確認', async () => {
    await context.storage.set('check', { ok: true });
    const value = await context.storage.get('check');
    await context.secrets.set('check', 'appdock-test-secret');
    const secret = await context.secrets.get('check');
    await context.secrets.delete('check');
    if (secret !== 'appdock-test-secret' || !(value as { ok?: boolean })?.ok)
      throw new Error('保存APIの検証に失敗しました。');
    await context.log.info('Storage / Secrets API の往復を確認しました。');
  });
  context.tray.add('テスト通知', 'appdock.welcome.notify');
  await refresh();
  await context.log.info('TypeScript拡張がホストに接続しました。');
}
