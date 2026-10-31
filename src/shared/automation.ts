export type ConnectionScope = 'local' | 'network';

export const retiredMcpPermissionKeys = [
  'allowManageApplets',
  'allowEditShortcuts',
  'allowEditGestures',
  'allowEditTouchpadGestures',
  'allowEditRibbon',
  'allowManageMcpServers',
  'allowEditTray',
  'allowManageCustomCommands',
] as const;
export const retiredPermissionActions = [
  'setAppletManagement',
  'setShortcutEditing',
  'setGestureEditing',
  'setTouchpadGestureEditing',
  'setRibbonEditing',
  'setMcpServerManagement',
  'setTrayEditing',
  'setCustomCommandManagement',
] as const;

export interface AutomationState {
  connectionScope: ConnectionScope;
  activeConnectionScope: ConnectionScope | null;
  networkHostnames: string[];
  networkEndpoints: string[];
  canCopyToken: boolean;
  lastLocalClientAt?: string;
  lastNetworkClientAt?: string;
  enabled: boolean;
  allowWrite: boolean;
  allowExecute: boolean;
  allowManageApplets: boolean;
  allowEditShortcuts: boolean;
  allowEditGestures: boolean;
  allowEditTouchpadGestures: boolean;
  allowEditRibbon: boolean;
  allowUseTts: boolean;
  allowUseAi: boolean;
  allowUseMcp: boolean;
  allowSendInput: boolean;
  allowRunProcesses: boolean;
  allowManageMcpServers: boolean;
  allowEditTray: boolean;
  allowManageCustomCommands: boolean;
  port: number;
  starting: boolean;
  running: boolean;
  endpoint: string;
  serverId: string;
  error?: string;
  lastClientAt?: string;
  configFile: string;
  registration: 'absent' | 'registered' | 'conflict';
  registrationError?: string;
}

export type AutomationAction =
  | { kind: 'setConnectionScope'; scope: ConnectionScope }
  | { kind: 'setNetworkHostnames'; hostnames: string[] }
  | { kind: 'copyToken' | 'retryStart' }
  | { kind: 'copyEndpoint'; endpoint: string }
  | { kind: 'status' }
  | { kind: 'configure'; enabled: boolean; allowWrite: boolean; port: number }
  | { kind: 'register' | 'unregister'; confirmationId?: string }
  | { kind: 'test' | 'rotateToken' }
  | { kind: 'selectConfig'; file: string }
  | { kind: 'selectName'; name: string }
  | { kind: 'setTts'; allowed: boolean }
  | { kind: 'setAi'; allowed: boolean }
  | { kind: 'setMcpClient'; allowed: boolean }
  | { kind: 'setInputSending'; allowed: boolean }
  | { kind: 'setProcessLaunching'; allowed: boolean }
  | { kind: 'setMcpServerManagement'; allowed: boolean }
  | { kind: 'setExecution'; allowed: boolean }
  | { kind: 'setAppletManagement'; allowed: boolean }
  | { kind: 'setShortcutEditing'; allowed: boolean }
  | { kind: 'setGestureEditing'; allowed: boolean }
  | { kind: 'setTouchpadGestureEditing'; allowed: boolean }
  | { kind: 'setRibbonEditing'; allowed: boolean }
  | { kind: 'setCustomCommandManagement'; allowed: boolean }
  | { kind: 'setTrayEditing'; allowed: boolean };
// Separate management grants never enable command execution implicitly.

export interface AutomationReply {
  state: AutomationState;
  message?: string;
  registrationConfirmation?: {
    id: string;
    kind: 'register' | 'unregister';
    name: string;
    configFile: string;
  };
}
