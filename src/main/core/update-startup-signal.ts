import { createConnection } from 'node:net';

/** Consume the one-launch capability before Applets or other child processes can inherit it. */
export function takeUpdateStartupSignal(environment: NodeJS.ProcessEnv = process.env) {
  const pipe = environment.APPDOCK_UPDATE_READY_PIPE;
  delete environment.APPDOCK_UPDATE_READY_PIPE;
  const valid = !!pipe && /^AppDock\.UpdateReady\.[a-f0-9]{32}$/.test(pipe);
  let sent = false;
  return {
    get pending() {
      return valid && !sent;
    },
    notify(shown: boolean) {
      if (sent || !shown || !valid) return;
      sent = true;
      // This optional acknowledgment must never hold up startup or change its result.
      const socket = createConnection(`\\\\.\\pipe\\${pipe}`);
      socket.unref();
      socket.setTimeout(2000, () => socket.destroy());
      socket.on('error', () => socket.destroy());
      socket.once('connect', () => socket.end('shown\n'));
    },
  };
}
