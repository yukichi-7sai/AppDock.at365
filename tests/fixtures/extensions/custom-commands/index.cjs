exports.activate = async (context) => {
  await context.customCommands.register('test.custom-node.echo', async (config, invocation) => {
    if (config.delay)
      await new Promise((resolve, reject) => {
        const cancel = () => {
          clearTimeout(timer);
          reject(Error('cancelled'));
        };
        const timer = setTimeout(() => {
          invocation.signal.removeEventListener('abort', cancel);
          resolve();
        }, config.delay);
        invocation.signal.addEventListener('abort', cancel, { once: true });
        if (invocation.signal.aborted) cancel();
      });
    const info = await context.appdock.call('system.getInfo');
    return {
      message: config.message,
      source: invocation.source ?? 'local',
      apiVersion: info.apiVersion,
    };
  });
};
