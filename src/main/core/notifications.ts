import { hostText } from '../../shared/i18n';
import { app, Notification } from 'electron';
import { createHash } from 'node:crypto';
import type { NotificationLevel } from '../../shared/notifications';
import { notificationProtocol, notificationXml, NotificationRoutes } from './notification-routing';
let routes: NotificationRoutes | undefined;
let registered = false;
let registration: { executable: string; args: string[] } | undefined;
export function configureNotifications(executable: string, profile: string, args: string[]) {
  if (process.platform !== 'win32') return;
  routes = new NotificationRoutes(notificationProtocol(executable, profile, app.isPackaged));
  registration = { executable, args };
}
export function activateNotification(argv: string[], fallback: () => void) {
  return routes?.activate(argv, fallback) ?? false;
}
export interface NativeNotificationHandle {
  close(): void;
  release(): void;
}
export interface NativeNotificationInput {
  id: string;
  title: string;
  body: string;
  level: NotificationLevel;
  silent: boolean;
  clicked(): void;
  failed(): void;
  closed(): void;
}
/** Only the OS adapter calls this transport; preferences/lifetime stay in NotificationService. */
export function showNotification(input: NativeNotificationInput): NativeNotificationHandle {
  if (!Notification.isSupported()) throw Error('Windows notifications unsupported');
  if (routes && registration && !registered)
    registered = app.setAsDefaultProtocolClient(
      routes.protocol,
      registration.executable,
      registration.args,
    );
  if (routes && !registered)
    throw Error(hostText('services.notifications.activationRegistrationFailed'));
  const uri = routes?.add(input.clicked);
  let notification: Notification;
  try {
    notification = new Notification(
      uri
        ? {
            toastXml: notificationXml(input.title, input.body, input.silent, uri),
            id: createHash('sha256').update(input.id).digest('hex').slice(0, 16),
            groupId: routes!.protocol.slice(-16),
          }
        : { title: input.title, body: input.body, silent: input.silent },
    );
  } catch (error) {
    if (uri) routes?.remove(uri);
    throw error;
  }
  if (!routes) notification.on('click', input.clicked);
  notification.on('failed', input.failed);
  notification.on('close', input.closed);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (uri) routes?.remove(uri);
    notification.removeAllListeners();
  };
  try {
    notification.show();
  } catch (error) {
    release();
    throw error;
  }
  return {
    release,
    close: () => {
      release();
      notification.close();
    },
  };
}
