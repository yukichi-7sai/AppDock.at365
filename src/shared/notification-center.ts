import type { NotificationItem, NotificationActionRequest } from './notifications';
export interface NotificationCenterItem extends NotificationItem {
  ownerTitle: string;
  typeTitle: string;
}
export interface NotificationCenterFilters {
  tab: 'active' | 'history';
  level: 'all' | 'info' | 'warning' | 'error';
  source: string;
  status: 'all' | 'resolved' | 'dismissed' | 'expired' | 'withdrawn';
  text: string;
}
export interface NotificationCenterRequest {
  id: string;
  route: 'notifications';
  kind: 'notifications';
}
export interface NotificationCenterModel {
  schemaVersion: 1;
  id: string;
  contextId: 'primary';
  kind: 'notifications';
  revision: number;
  dark: boolean;
  content: {
    filters: NotificationCenterFilters;
    items: NotificationCenterItem[];
    sources: { id: string; title: string }[];
    total: number;
    activeCount: number;
    historyCount: number;
    offset: number;
    pageSize: number;
    nextCursor: string | null;
  };
}
export type NotificationCenterOperation =
  | { type: 'filters'; filters: NotificationCenterFilters }
  | { type: 'page'; cursor: string }
  | { type: 'refresh' }
  | { type: 'act'; request: NotificationActionRequest };
export interface NotificationCenterAction {
  id: string;
  type: 'notifications';
  action: NotificationCenterOperation;
}
