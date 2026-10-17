// waitForFunction treats an async predicate's Promise as truthy before it settles.
async function waitForHost(host, predicate, arg, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await host.evaluate(predicate, arg)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error('Host UI did not reach the expected state');
}
async function settingsPage(host) {
  await waitForHost(host, async () => {
    const surface = document.querySelector('.settings-surface[data-settings-connection]');
    if (!surface || !surface.getClientRects().length) return false;
    const state = await window.dock.snapshot();
    const context =
      state.navigation.route === 'settings'
        ? 'full'
        : state.navigation.route === 'extensions'
          ? 'applet'
          : null;
    if (!context || !surface.classList.contains(context)) return false;
    try {
      const model = await window.dock.settingsPage.get(surface.dataset.settingsConnection);
      return model.content.context === context;
    } catch {
      return false;
    }
  });
  return host;
}
/** Resolve locators again after host settings navigation. */
function deferred(resolve, chain = []) {
  const locate = async () => {
    let value = await resolve();
    for (const [name, args] of chain) value = value[name](...args);
    return value;
  };
  return new Proxy(
    {},
    {
      get(_target, name) {
        if (name === 'then') return undefined;
        if (
          [
            'getByRole',
            'getByLabel',
            'getByText',
            'getByPlaceholder',
            'getByAltText',
            'locator',
            'filter',
            'first',
            'last',
            'nth',
          ].includes(name)
        )
          return (...args) => deferred(resolve, [...chain, [name, args]]);
        return async (...args) => (await locate())[name](...args);
      },
    },
  );
}
module.exports = { settingsPage, deferred, waitForHost };
