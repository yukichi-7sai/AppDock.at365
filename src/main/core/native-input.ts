import { hostText } from '../../shared/i18n';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { JsonLinePeer } from './rpc';
import { AutomationError } from './appdock-api';
import type { InputInvocation } from './command-contexts';

/** A lazy native worker without a keyboard/mouse hook. No shell command is constructed. */
export class NativeInput {
  private child?: ChildProcessWithoutNullStreams;
  private peer?: JsonLinePeer;
  private stopped = false;
  private active = new Map<string, { appletId: string; cancel(): void }>();
  constructor(private executable: string) {}
  async send(
    method: string,
    params: Record<string, unknown>,
    appletId: string,
    invocation: InputInvocation = {},
  ) {
    if (this.stopped || invocation.signal?.aborted)
      throw new AutomationError('CANCELLED', hostText('services.nativeInput.cancelled'));
    if (!this.peer) {
      const child = spawn(this.executable, [], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const peer = new JsonLinePeer(child.stdout, child.stdin, async () => {
        throw Error('Unknown input event');
      });
      this.child = child;
      this.peer = peer;
      child.stderr.resume();
      const closed = () => {
        peer.close();
        if (this.peer === peer) {
          this.peer = undefined;
          this.child = undefined;
        }
      };
      child.on('error', closed);
      child.on('exit', closed);
    }
    const peer = this.peer,
      id = randomUUID();
    const cancel = () => {
      if (!peer.closed) peer.send({ jsonrpc: '2.0', method: 'input.cancel', params: { id } });
    };
    this.active.set(id, { appletId, cancel });
    invocation.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const result = await peer.request(
        method,
        {
          ...params,
          id,
          window: invocation.window ?? '0',
          gesture: invocation.source === 'gesture',
        },
        5000,
      );
      if (!result.ok) throw new AutomationError(result.code, result.message);
      return { completion: 'inputSubmitted', effectVerified: false };
    } catch (e) {
      cancel();
      if (e instanceof AutomationError) throw e;
      throw new AutomationError('INPUT_FAILED', hostText('services.nativeInput.connectionFailed'));
    } finally {
      invocation.signal?.removeEventListener('abort', cancel);
      this.active.delete(id);
    }
  }
  cancelApplet(id: string) {
    for (const entry of this.active.values()) if (entry.appletId === id) entry.cancel();
  }
  close() {
    this.stopped = true;
    this.peer?.close();
    this.child?.kill();
    this.peer = undefined;
    this.child = undefined;
  }
}
