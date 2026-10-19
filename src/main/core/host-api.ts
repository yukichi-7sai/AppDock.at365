import type { TypedNotifications } from './typed-notifications';
import { SettingsCommands } from './settings-commands';
import fs from 'node:fs';
import path from 'node:path';
import { imageDirectory, registerLocalImages } from './panel-images';
import { safeStorage, shell, dialog, nativeTheme, nativeImage } from 'electron';
import { legacyNotificationTypeId } from '../../shared/notification-types';
import { queueSound } from './sounds';
import { RegisteredSounds } from './registered-sounds';
import type { ExtensionInstance } from './extensions';
import type { SettingsStore } from './settings';
import { atomicWrite, isObject } from './settings';
import type { Panel } from '../../shared/contracts';
import { parseSettingOptions, validateSettingValue } from '../../shared/setting-definitions';
import { parseExtensionCommands } from '../../shared/extension-commands';
import {
  generatedSettingCommands,
  validateSettingCommandIds,
} from '../../shared/settings-commands';
import { getWebAccounts } from './web-accounts';
import { safePageShortcut } from '../../shared/keybindings';
import { pathToFileURL } from 'node:url';
import { contained } from './extensions';
import { pageKey } from '../../shared/applet-pages';
import { openLocalPage, pageHostShortcut } from './applet-pages';
import { disposeAppletPage, hideAppletPage, updateAppletPage } from './applet-pages';
import { localPageImages, notifyAppletPage } from './applet-pages';
import { parseDynamicPages } from '../../shared/dynamic-pages';
export function createHostApi(
  settings: SettingsStore,
  dataRoot: string,
  log: (level: string, source: string, message: string) => void,
  changed: () => void,
  commandsChanged: () => void = changed,
  executeCommand: (id: string) => Promise<unknown> = async () => {},
  assetRoot = path.join(dataRoot, 'registered-assets'),
  appdockCall?: (e: ExtensionInstance, request: unknown) => Promise<unknown>,
  settingsCommands = new SettingsCommands({
    settings,
    applets: () => [],
    save: (value, revision) => settings.save(value, revision),
  }),
  typedNotifications?: () => TypedNotifications | undefined,
  shellState?: (id: string) => import('../../shared/shell').OwnShellState | undefined,
  collectionHost?: () => import('./page-collections').PageCollectionManager,
  ribbonBadges?: import('./ribbon-badges').RibbonBadges,
  sharedDataRoot = path.join(dataRoot, 'shared'),
  customCommands?: import('./custom-commands').CustomCommandService,
  pageUi?: { openDetails(id: string): Promise<unknown>; failed?(id: string): void },
) {
  const api = async (e: ExtensionInstance, method: string, params: unknown): Promise<unknown> => {
    if (!isObject(params)) throw new Error('API引数はオブジェクトで指定してください。');
    const p = params;
    const id = e.manifest.id;
    const validAction = (action: unknown) =>
      isObject(action) &&
      typeof action.title === 'string' &&
      action.title.length <= 200 &&
      (action.selected == null || typeof action.selected === 'boolean') &&
      ((typeof action.command === 'string' &&
        action.command.startsWith(id + '.') &&
        !action.actionId) ||
        (typeof action.actionId === 'string' &&
          action.actionId.startsWith(id + '.') &&
          action.actionId.length <= 200 &&
          !action.command));
    const stoppingLog = e.state === 'stopping' && method === 'host.log';
    if (['stopped', 'stopping', 'error'].includes(e.state) && !stoppingLog)
      throw new Error('拡張は停止しています。');
    const requireCapability = (cap: string) => {
      if (!e.manifest.capabilities?.includes(cap))
        throw new Error(`manifest の capabilities に ${cap} が必要です。`);
    };
    const key = () => {
      if (
        typeof p.key !== 'string' ||
        !/^[a-zA-Z0-9._-]{1,100}$/.test(p.key) ||
        ['__proto__', 'constructor', 'prototype'].includes(p.key)
      )
        throw new Error('key の形式が正しくありません。');
      return p.key as string;
    };
    switch (method) {
      case 'host.customCommands.register':
        requireCapability('custom-commands');
        if (!customCommands || !e.runtimeSession || Object.keys(p).some((k) => k !== 'typeId'))
          throw Error('種類登録を利用できません。');
        customCommands.registerApplet(id, e.runtimeSession, p.typeId);
        return null;
      case 'host.ribbon.setBadge': {
        requireCapability('ribbon-badges');
        if (
          !ribbonBadges ||
          !e.runtimeSession ||
          Object.keys(p).some((key) => !['target', 'badge'].includes(key)) ||
          !isObject(p.target)
        )
          throw Error('バッジの対象ページを指定してください。');
        const target = p.target;
        let item: string | undefined;
        if (Object.keys(target).length === 1 && typeof target.pageId === 'string') {
          const page = [...(e.manifest.pages ?? []), ...(e.dynamicPages ?? [])].find(
            (page) => page.id === target.pageId,
          );
          if (page) item = pageKey(id, page.id);
        } else if (
          Object.keys(target).length === 2 &&
          typeof target.collectionKey === 'string' &&
          typeof target.itemId === 'string'
        ) {
          const page = collectionHost?.()
            .entries()
            .find(
              (page) =>
                page.binding.owner === id &&
                page.binding.key === target.collectionKey &&
                page.binding.itemId === target.itemId &&
                page.item.enabled,
            );
          if (page) item = pageKey(page.id, 'main');
        }
        if (!item) throw Error('自身が登録したページだけにバッジを設定できます。');
        return ribbonBadges.set(id, e.runtimeSession, item, p.badge);
      }
      case 'host.webProfiles.list':
      case 'host.webProfiles.add':
      case 'host.webProfiles.rename':
      case 'host.webProfiles.clear':
      case 'host.webProfiles.delete': {
        requireCapability('web-profiles');
        if (!collectionHost) throw Error('WebプロフィールAPIは準備中です。');
        const profiles = collectionHost().profiles(id);
        if (method === 'host.webProfiles.list') return profiles.accounts();
        if (method === 'host.webProfiles.add') return profiles.addAccount(p.name);
        if (typeof p.id !== 'string') throw Error('アカウントIDを指定してください。');
        if (method === 'host.webProfiles.rename') return profiles.renameAccount(p.id, p.name);
        if (method === 'host.webProfiles.clear') return profiles.clearAccount(p.id);
        return profiles.deleteAccount(p.id);
      }
      case 'host.images.normalize': {
        requireCapability('images');
        if (
          !Array.isArray(p.bytes) ||
          p.bytes.length > 4 * 1024 * 1024 ||
          !p.bytes.every((v: unknown) => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 255)
        )
          throw Error('画像は4MB以下で指定してください。');
        const bytes = Buffer.from(p.bytes);
        const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        const webp =
          bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
        if (!png && !jpeg && !webp) throw Error('PNG・JPEG・WebP画像を指定してください。');
        const source = nativeImage.createFromBuffer(bytes);
        const size = source.getSize();
        if (source.isEmpty() || size.width > 2048 || size.height > 2048)
          throw Error('画像の形式・サイズを確認してください。');
        const result = source.resize({ width: 32, height: 32 }).toDataURL();
        if (result.length > 24576) throw Error('画像が大きすぎます。');
        return result;
      }
      case 'host.settings.update': {
        requireCapability('settings');
        if (!Number.isSafeInteger(p.expectedRevision))
          throw Error('現在の設定revisionを指定してください。');
        settings.assertRevision(p.expectedRevision as number);
        settingsCommands.setOwnSetting(e.manifest, key(), p.value);
        return { revision: settings.revision };
      }
      case 'host.pages.openItem': {
        requireCapability('pages');
        if (!collectionHost || typeof p.id !== 'string')
          throw Error('ページIDを指定してください。');
        const page = collectionHost().find(p.id);
        if (!page || page.binding.owner !== id) throw Error('自身のページだけを開けます。');
        return collectionHost().open(page.id);
      }
      case 'host.pages.list':
        requireCapability('pages');
        return {
          revision: e.pageRevision ?? 0,
          pages: structuredClone([...(e.manifest.pages ?? []), ...(e.dynamicPages ?? [])]),
        };
      case 'host.pages.changed':
      case 'host.pages.images.register':
      case 'host.pages.images.release': {
        requireCapability('pages');
        const page = [...(e.manifest.pages ?? []), ...(e.dynamicPages ?? [])].find((page) => page.id === p.id);
        if (!page || page.source !== 'local') throw Error('ローカルページがありません。');
        const allowedKeys = method === 'host.pages.changed' ? ['id'] : method.endsWith('.register') ? ['id','files'] : ['id','imageIds'];
        if (Object.keys(p).some((key) => !allowedKeys.includes(key))) throw Error('ページ操作の引数を確認してください。');
        const target = pageKey(id, page.id);
        if (method === 'host.pages.changed') return { accepted: true, delivered: notifyAppletPage(target) };
        requireCapability('local-images');
        const images = localPageImages(target);
        if (!images) throw Error('画像を登録するページを先に開いてください。');
        if (method.endsWith('.register')) {
          if (Buffer.byteLength(JSON.stringify(p)) > 256 * 1024 - 512) throw Error('画像の登録を分割してください。');
          return images.register(p.files);
        }
        images.release(p.imageIds);
        return null;
      }
      case 'host.pages.replace': {
        const next = parseDynamicPages(e.manifest, p.pages);
        if (
          !Number.isSafeInteger(p.expectedRevision) ||
          p.expectedRevision !== (e.pageRevision ?? 0)
        )
          throw Error('ページの登録が変更されています。現在の一覧を取得してください。');
        for (const page of next) contained(e.manifest.folder, page.ui!);
        if (next.some((page) => e.commands.some((command) => command.id === page.openCommand)))
          throw Error('ページ操作が実行中のコマンドと重複しています。');
        for (const page of e.dynamicPages ?? []) {
          const replacement = next.find((candidate) => candidate.id === page.id);
          if (!replacement || replacement.ui !== page.ui || replacement.source !== page.source)
            disposeAppletPage(pageKey(id, page.id));
        }
        e.dynamicPages = next;
        e.pageRevision = (e.pageRevision ?? 0) + 1;
        for (const page of next)
          updateAppletPage(pageKey(id, page.id), page.title, page.defaultDisplay);
        commandsChanged();
        return { revision: e.pageRevision };
      }
      case 'host.pages.hide':
      case 'host.pages.dispose': {
        requireCapability('pages');
        const page = [...(e.manifest.pages ?? []), ...(e.dynamicPages ?? [])].find(
          (page) => page.id === p.id,
        );
        if (!page || page.source !== 'local') throw Error('ローカルページがありません。');
        if (method === 'host.pages.hide') hideAppletPage(pageKey(id, page.id));
        else disposeAppletPage(pageKey(id, page.id));
        return null;
      }
      case 'host.shell.getState': {
        requireCapability('shell');
        if (!shellState) throw Error('Shell状態APIは準備中です。');
        e.shellStateRequested = true;
        return shellState(id);
      }
      case 'host.appdock.call':
        if (!appdockCall) throw Error('AppDock操作APIは準備中です。');
        return appdockCall(e, p);
      case 'host.pages.open': {
        requireCapability('pages');
        const page = [...(e.manifest.pages ?? []), ...(e.dynamicPages ?? [])].find(
          (page) => page.id === p.id,
        );
        if (!page || page.source !== 'local') throw Error('ローカルページがありません。');
        const pageGeneration = e.runtimeSession;
        return openLocalPage(
          {
            appletId: id,
            key: pageKey(id, page.id),
            title: page.title,
            url: pathToFileURL(contained(e.manifest.folder, page.ui!)).href,
            preload: path.resolve(__dirname, '../applet-page-preload.js'),
            stateFile: path.join(dataRoot, 'pages', id, page.id, 'window-state.json'),
            defaultDisplay: page.defaultDisplay,
            partition: `applet-page:${pageKey(id, page.id)}`,
            ...(e.manifest.capabilities?.includes('local-images') ? { pageImages: {
              dataRoot,
              active: () => e.state === 'running' && e.runtimeSession === pageGeneration,
            } } : {}),
            onLayout: () => {},
            onCreated: (contents) =>
              contents.on('before-input-event', (event, input) => {
                if (safePageShortcut(input) && pageHostShortcut(input, id)) event.preventDefault();
              }),
          },
          {
            snapshot: () => ({
              revision: settings.revision,
              collectionPages:
                collectionHost?.()
                  .entries()
                  .filter((page) => page.binding.owner === id)
                  .map((page) => ({ id: page.id, key: page.binding.key, itemId: page.item.id })) ??
                [],
              page: {
                id: page.id,
                context: structuredClone(
                  e.dynamicPages?.find((current) => current.id === page.id)?.context ?? {},
                ),
              },
              dark: nativeTheme.shouldUseDarkColors,
              settings: e.manifest.capabilities?.includes('settings')
                ? Object.fromEntries(
                    (e.manifest.settings ?? []).map((definition) => [
                      definition.key,
                      settings.value.extensions[id]?.settings[definition.key] ?? definition.default,
                    ]),
                  )
                : {},
            }),
            execute: (command) => {
              if (
                e.state !== 'running' ||
                typeof command !== 'string' ||
                ![
                  ...e.commands,
                  ...generatedSettingCommands(id, e.manifest.settings ?? [], true),
                ].some((item) => item.id === command)
              )
                throw Error('自身の実行中コマンドだけを呼び出せます。');
              return executeCommand(command);
            },
            call: async (operation, input) => {
              if (operation === 'actions.invoke') {
                if (
                  e.state !== 'running' ||
                  !isObject(input) ||
                  typeof input.id !== 'string' ||
                  !isObject(input.input)
                )
                  throw Error('ページ操作の引数を確認してください。');
                const declaration = e.manifest.pageActions?.find(
                  (action) => action.id === input.id,
                );
                const fields = declaration?.parameters ?? {};
                if (
                  !declaration ||
                  JSON.stringify(input.input).length > 65536 ||
                  Object.keys(input.input).some((key) => !Object.hasOwn(fields, key)) ||
                  Object.entries(fields).some(
                    ([key, type]) => typeof (input.input as Record<string, unknown>)[key] !== type,
                  )
                )
                  throw Error('宣言されたページ操作と引数だけを使用できます。');
                const generation = e.runtimeSession;
                let result: unknown;
                try {
                  if (!e.peer || e.peer.closed) throw Error('ページの提供元が終了しました。');
                  result = await e.peer.request('page.action', {
                    id: declaration.id, input: input.input, pageId: page.id,
                  });
                } catch (error) {
                  if (e.state === 'running' && e.runtimeSession === generation) pageUi?.failed?.(id);
                  throw error;
                }
                if (e.state !== 'running' || e.runtimeSession !== generation)
                  throw Error('ページの提供元が終了しました。');
                return result;
              }
              const allowed = [
                'settings.update',
                'webProfiles.list',
                'webProfiles.add',
                'webProfiles.rename',
                'webProfiles.clear',
                'webProfiles.delete',
                'images.normalize',
                'pages.openItem',
              ];
              if (
                e.state !== 'running' ||
                typeof operation !== 'string' ||
                !allowed.includes(operation)
              )
                throw Error('このページから利用できない操作です。');
              return api(e, `host.${operation}`, input);
            },
            changed: (callback) => {
              settings.on('changed', callback);
              nativeTheme.on('updated', callback);
              return () => {
                settings.removeListener('changed', callback);
                nativeTheme.removeListener('updated', callback);
              };
            },
          },
        );
      }
      case 'host.webAccounts.start':
      case 'host.webAccounts.open':
      case 'host.webAccounts.cycle':
      case 'host.webAccounts.navigate':
      case 'host.webAccounts.read':
      case 'host.webAccounts.report': {
        requireCapability('web-accounts');
        const web = getWebAccounts(
          id,
          e.manifest.displayName ?? e.manifest.name,
          e.manifest.folder,
          dataRoot,
          e.manifest.webAccounts,
          {
            sharedRoot: sharedDataRoot,
            capabilities: e.manifest.capabilities ?? [],
            soundsDirectory: path.join(assetRoot, id, 'sounds'),
            page: e.manifest.pages?.find((page) => page.source === 'web-accounts'),
            settings: () =>
              Object.fromEntries(
                (e.manifest.capabilities?.includes('settings') ? (e.manifest.settings ?? []) : [])
                  .filter(
                    (definition) =>
                      definition.type === 'boolean' ||
                      (definition.type === 'select' && !definition.dynamic),
                  )
                  .map((definition) => {
                    const value =
                      settings.value.extensions[id]?.settings[definition.key] ?? definition.default;
                    return [
                      definition.key,
                      definition.type === 'boolean'
                        ? value === true
                        : typeof value === 'string'
                          ? value
                          : '',
                    ];
                  }),
              ),
            setSetting: (key, value) => {
              requireCapability('settings');
              const definition = e.manifest.settings?.find(
                (definition) =>
                  definition.key === key &&
                  (definition.type === 'boolean' ||
                    (definition.type === 'select' && !definition.dynamic)),
              );
              if (!definition) throw Error('宣言されたboolean/静的select設定を指定してください。');
              validateSettingValue(definition, value);
              const current = settings.value.extensions[id]?.settings ?? {};
              settings.updateExtension(id, { settings: { ...current, [definition.key]: value } });
            },
            onSettingsChanged: (callback) => {
              settings.on('changed', callback);
              return () => settings.removeListener('changed', callback);
            },
            failed: (message) => log('error', id, message),
            shortcut: (input) => pageHostShortcut(input, id),
          },
        );
        if (method.endsWith('.start')) {
          await web.start();
          return null;
        }
        if (method.endsWith('.open')) {
          await web.open();
          return null;
        }
        if (method.endsWith('.cycle')) {
          await web.cycle(p.direction);
          return null;
        }
        if (method.endsWith('.navigate')) {
          await web.navigate(p.action);
          return null;
        }
        if (method.endsWith('.report')) {
          web.report(p.id as string, p.status as string, p.attention as boolean, p.data);
          return null;
        }
        return web.read();
      }
      case 'host.ui.pickFile': {
        requireCapability('file-dialog');
        if (p.kind !== 'json' && p.kind !== 'wav')
          throw new Error('JSONまたはWAVを指定してください。');
        const result = await dialog.showOpenDialog({
          title: p.kind === 'json' ? 'OAuthクライアントJSONを選択' : '通知音を選択',
          properties: ['openFile'],
          filters: [{ name: p.kind.toUpperCase(), extensions: [p.kind] }],
        });
        return result.canceled ? null : (result.filePaths[0] ?? null);
      }
      case 'host.audio.play': {
        requireCapability('audio');
        if (typeof p.file !== 'string') throw new Error('音声ファイルを指定してください。');
        const child = e.child;
        queueSound(
          p.file && !path.isAbsolute(p.file)
            ? await new RegisteredSounds(path.join(assetRoot, id, 'sounds')).resolve(p.file)
            : p.file,
          () => e.child === child && ['starting', 'running'].includes(e.state),
          () => log('error', id, '通知音を再生できません。WAVファイルを確認してください。'),
        );
        return null;
      }
      case 'host.tray.attention':
        requireCapability('tray-attention');
        if (typeof p.active !== 'boolean') throw new Error('activeはbooleanです。');
        e.attention = p.active;
        commandsChanged();
        return null;
      case 'host.commands.replace': {
        requireCapability('dynamic-commands');
        const commands = parseExtensionCommands(id, p.commands);
        validateSettingCommandIds(id, e.manifest.settings ?? [], commands);
        e.commands = commands;
        e.tray = e.tray.filter((item) =>
          [...commands, ...generatedSettingCommands(id, e.manifest.settings ?? [], true)].some(
            (command) => command.id === item.command,
          ),
        );
        commandsChanged();
        return null;
      }
      case 'host.log':
        log(
          ['info', 'warn', 'error'].includes(p.level) ? p.level : 'info',
          id,
          String(p.message ?? ''),
        );
        return null;
      case 'host.settings.get':
        return structuredClone(settings.value.extensions[id]?.settings ?? {});
      case 'host.settings.set': {
        requireCapability('settings');
        const k = key();
        settingsCommands.setOwnSetting(e.manifest, k, p.value);
        return null;
      }
      case 'host.settings.options': {
        requireCapability('settings');
        const k = key();
        if (!e.manifest.settings?.some((s) => s.key === k && s.type === 'select' && s.dynamic))
          throw new Error('動的な選択肢を宣言した設定項目が必要です。');
        const options = parseSettingOptions(p.options);
        if (JSON.stringify(e.settingOptions[k]) !== JSON.stringify(options)) {
          e.settingOptions[k] = options;
          changed();
        }
        return null;
      }
      case 'host.notifications.publish':
      case 'host.notifications.policy':
      case 'host.notifications.end': {
        requireCapability('notifications');
        const service = typedNotifications?.();
        if (!service) throw Error('通知基盤は準備中です。');
        const owner = { ownerKind: 'applet' as const, ownerId: id };
        const generation = e.runtimeSession;
        if (!generation) throw Error('通知の実行世代がありません。');
        if (method === 'host.notifications.end') {
          if (
            Object.keys(p).some((k) => !['notificationId', 'status'].includes(k)) ||
            typeof p.notificationId !== 'string' ||
            (p.status !== undefined && !['resolved', 'withdrawn'].includes(p.status))
          )
            throw Error('通知終了の引数が不正です。');
          service.end(
            owner,
            p.notificationId,
            generation,
            p.status === 'withdrawn' ? 'withdrawn' : 'resolved',
          );
          return null;
        }
        if (typeof p.typeId !== 'string') throw Error('typeIdが必要です。');
        const type = e.manifest.notificationTypes?.find((t) => t.typeId === p.typeId);
        if (!type) throw Error('自身の宣言された通知種類だけを使用できます。');
        if (method === 'host.notifications.policy') {
          if (Object.keys(p).some((k) => k !== 'typeId')) throw Error('通知方針の引数が不正です。');
          return service.policy(owner, p.typeId);
        }
        if (
          Object.keys(p).some(
            (k) =>
              ![
                'typeId',
                'title',
                'body',
                'level',
                'dedupeKey',
                'historyText',
                'actions',
                'restartTimer',
                'silent',
              ].includes(k),
          ) ||
          (p.restartTimer !== undefined && typeof p.restartTimer !== 'boolean') ||
          (p.silent !== undefined && typeof p.silent !== 'boolean') ||
          (p.dedupeKey != null && typeof p.dedupeKey !== 'string') ||
          (p.level != null && !type.levels.includes(p.level)) ||
          (p.historyText != null &&
            (!isObject(p.historyText) ||
              Object.keys(p.historyText).some((k) => !['title', 'body'].includes(k)))) ||
          (p.actions != null && (!Array.isArray(p.actions) || p.actions.length > 3))
        )
          throw Error('通知発行の引数が不正です。');
        const actions = (p.actions ?? []).map((a: unknown) => {
          if (
            !isObject(a) ||
            Object.keys(a).some(
              (k) => !['key', 'label', 'primary', 'disabled', 'command'].includes(k),
            ) ||
            typeof a.key !== 'string' ||
            !a.key ||
            a.key.length > 100 ||
            typeof a.label !== 'string' ||
            !a.label ||
            a.label.length > 100 ||
            (a.primary !== undefined && typeof a.primary !== 'boolean') ||
            (a.disabled !== undefined && typeof a.disabled !== 'boolean') ||
            typeof a.command !== 'string' ||
            !e.commands.some((c) => c.id === a.command)
          )
            throw Error('自身の登録済みコマンドだけを通知操作に使用できます。');
          const command = a.command;
          return {
            key: a.key,
            label: a.label,
            primary: a.primary,
            disabled: a.disabled,
            run: async () => {
              if (
                e.state !== 'running' ||
                e.runtimeSession !== generation ||
                !e.commands.some((c) => c.id === command)
              )
                throw Error('通知操作の発行元が停止しました。');
              await executeCommand(command);
            },
          };
        });
        if (new Set(actions.map((a: { key: string }) => a.key)).size !== actions.length)
          throw Error('通知操作keyが重複しています。');
        return service.publish(
          owner,
          p.typeId,
          {
            title: p.title,
            body: p.body,
            level: p.level ?? type.defaultLevel,
            dedupeKey: p.dedupeKey ?? undefined,
            historyText: p.historyText ?? undefined,
            actions,
            restartTimer: p.restartTimer,
            windowsSilent: p.silent === true,
          },
          generation,
        );
      }
      case 'host.notifications.show': {
        requireCapability('notifications');
        if (typeof p.title !== 'string' || typeof p.body !== 'string')
          throw new Error('title と body が必要です。');
        if (p.silent != null && typeof p.silent !== 'boolean')
          throw new Error('silentはbooleanです。');
        if (
          p.command != null &&
          (typeof p.command !== 'string' ||
            ![...e.commands, ...generatedSettingCommands(id, e.manifest.settings ?? [], true)].some(
              (c) => c.id === p.command,
            ))
        )
          throw new Error('このAppletの登録済みコマンドを指定してください。');
        const service = typedNotifications?.();
        if (!service) throw Error('通知基盤は準備中です。');
        const owner = { ownerKind: 'applet' as const, ownerId: id };
        if (!service.policy(owner, legacyNotificationTypeId).enabled) return null;
        const generation = e.runtimeSession,
          child = e.child;
        service.publish(
          owner,
          legacyNotificationTypeId,
          {
            level: 'info',
            title: p.title.slice(0, 100),
            body: p.body.slice(0, 500),
            windowsSilent: p.silent === true,
            historyText: { title: '旧方式の通知', body: 'Appletから通知がありました。' },
            ...(p.command
              ? {
                  windowsClickAction: 'open',
                  actions: [
                    {
                      key: 'open',
                      label: '開く',
                      run: async () => {
                        if (
                          e.state !== 'running' ||
                          e.child !== child ||
                          e.runtimeSession !== generation ||
                          ![
                            ...e.commands,
                            ...generatedSettingCommands(id, e.manifest.settings ?? [], true),
                          ].some((c) => c.id === p.command)
                        )
                          throw Error('通知の発行元または操作が変わりました。');
                        await executeCommand(p.command);
                      },
                    },
                  ],
                }
              : {}),
          },
          generation,
        );
        return null;
      }
      case 'host.browser.open': {
        requireCapability('browser');
        const url = new URL(String(p.url));
        if (url.protocol !== 'https:' || url.username || url.password)
          throw new Error('ブラウザでは資格情報を含まないHTTPS URLを指定してください。');
        await shell.openExternal(url.href);
        return null;
      }
      case 'host.ui.imageDirectory':
        requireCapability('local-images');
        return imageDirectory(dataRoot, id);
      case 'host.ui.openDetails':
        requireCapability('ui');
        if (Object.keys(p).length || !pageUi) throw Error('自身のApplet詳細だけを開けます。');
        return pageUi.openDetails(id);
      case 'host.ui.panel': {
        requireCapability('ui');
        if (
          p.images != null &&
          (!Array.isArray(p.images) ||
            p.images.length > 1000 ||
            p.images.some(
              (item: unknown) =>
                !isObject(item) ||
                typeof item.title !== 'string' ||
                item.title.length > 1200 ||
                (item.imageFile != null &&
                  (typeof item.imageFile !== 'string' ||
                    !path.isAbsolute(item.imageFile) ||
                    !e.manifest.capabilities?.includes('local-images'))) ||
                (item.tooltip != null &&
                  (typeof item.tooltip !== 'string' || item.tooltip.length > 32767)) ||
                (item.description != null &&
                  (typeof item.description !== 'string' || item.description.length > 1000)) ||
                (item.image != null &&
                  (typeof item.image !== 'string' ||
                    item.image.length > 200000 ||
                    !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
                      item.image,
                    ))) ||
                (item.actions != null &&
                  (!Array.isArray(item.actions) ||
                    item.actions.length > 4 ||
                    item.actions.some((a: unknown) => !validAction(a)))),
            ))
        )
          throw new Error('パネルの画像は1000件以内のサムネイルを指定してください。');
        if (
          typeof p.title !== 'string' ||
          (p.tabs != null &&
            (!Array.isArray(p.tabs) ||
              p.tabs.length > 100 ||
              p.tabs.some((a: unknown) => !validAction(a)))) ||
          p.title.length > 200 ||
          (p.description != null && typeof p.description !== 'string') ||
          (p.facts != null &&
            (!Array.isArray(p.facts) ||
              p.facts.length > 30 ||
              p.facts.some(
                (f: unknown) =>
                  !isObject(f) || typeof f.label !== 'string' || typeof f.value !== 'string',
              ))) ||
          (p.actions != null &&
            (!Array.isArray(p.actions) ||
              p.actions.length > 100 ||
              p.actions.some((a: unknown) => !validAction(a))))
        )
          throw new Error('パネルの形式が正しくありません。');
        e.panel = registerLocalImages(structuredClone(p) as unknown as Panel, dataRoot, id);
        changed();
        return null;
      }
      case 'host.storage.get':
      case 'host.storage.set': {
        requireCapability('storage');
        const k = key();
        const file = path.join(dataRoot, 'storage', id, k + '.json');
        if (method.endsWith('.get'))
          return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
        const text = JSON.stringify(p.value ?? null);
        if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('保存データは1MB以下です。');
        atomicWrite(file, text);
        return null;
      }
      case 'host.secrets.get':
      case 'host.secrets.set':
      case 'host.secrets.delete': {
        requireCapability('secrets');
        if (!safeStorage.isEncryptionAvailable())
          throw new Error('Windowsの暗号化機能を利用できません。');
        const file = path.join(dataRoot, 'secrets', id, key() + '.dat');
        if (method.endsWith('.get'))
          return fs.existsSync(file)
            ? safeStorage.decryptString(Buffer.from(fs.readFileSync(file, 'utf8'), 'base64'))
            : null;
        if (method.endsWith('.delete')) {
          if (fs.existsSync(file)) fs.unlinkSync(file);
          return null;
        }
        if (typeof p.value !== 'string' || p.value.length > 100000)
          throw new Error('secret は100,000文字以下の文字列です。');
        // Base64 is used only for the atomic writer, never exposed through the renderer.
        atomicWrite(file, safeStorage.encryptString(p.value).toString('base64'));
        return null;
      }
      default:
        throw new Error(`未対応のHost API: ${method}`);
    }
  };
  return api;
}
