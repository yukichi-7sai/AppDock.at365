const { settingsPage } = require('./settings-host-helper.cjs');
const { ribbonPage } = require('./shell-overlay-helper.cjs');
const methods = [
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
  'getByTitle',
];
function settingsAwarePage(host) {
  const roots = async () => {
    const result = [host];
    let settings;
    try {
      const route = (await host.evaluate(() => window.dock.snapshot())).navigation.route;
      if (
        ['settings', 'extensions'].includes(route) &&
        ((await host.locator('.settings-surface').count()) ||
          route === 'settings')
      )
        settings = await settingsPage(host);
    } catch {}
    if (settings && settings !== host) result.push(settings);
    const route = (await host.evaluate(() => window.dock.snapshot())).navigation.route;
    if (['home', 'logs'].includes(route)) {
      for (const p of host
        .context()
        .pages()
        .filter((p) => p.url().endsWith('/' + route + '.html'))) {
        try {
          const m = (await p.evaluate(() => window.appdockPage.connect())).snapshot;
          if (m.kind === route) result.push(p);
        } catch {}
      }
    }
    try {
      result.push(await ribbonPage(host));
    } catch {}
    return { result, settings };
  };
  const query = (chain) => {
    const resolve = async (allowMissing = false) => {
      const deadline = Date.now() + 15000;
      while (true) {
        const { result, settings } = await roots();
        let fallback;
        for (const root of result) {
          try {
            let loc = root;
            for (const [method, args] of chain) {
              const actual = [];
              for (const arg of args) {
                if (arg?.resolveSettingsLocator) actual.push(await arg.resolveSettingsLocator());
                else if (arg && typeof arg === 'object' && arg.has?.resolveSettingsLocator)
                  actual.push({ ...arg, has: await arg.has.resolveSettingsLocator() });
                else actual.push(arg);
              }
              loc = loc[method](...actual);
            }
            if (await loc.count()) return loc;
            if (root === settings || !fallback) fallback = loc;
          } catch {}
        }
        if (
          settings &&
          chain.length === 1 &&
          chain[0][0] === 'getByRole' &&
          chain[0][1][0] === 'heading' &&
          chain[0][1][1]?.name === '設定'
        ) {
          const opt = { ...chain[0][1][1] };
          delete opt.level;
          return settings.getByRole('heading', opt);
        }
        if (allowMissing || Date.now() >= deadline) return fallback;
        await new Promise((r) => setTimeout(r, 50));
      }
    };
    return new Proxy(
      {},
      {
        get(_target, name) {
          if (name === 'then') return undefined;
          if (name === 'resolveSettingsLocator') return resolve;
          if (methods.includes(name)) return (...args) => query([...chain, [name, args]]);
          return async (...args) => {
            const loc = await resolve(
              ['count', 'isVisible'].includes(name) ||
                (name === 'waitFor' && args[0]?.state === 'hidden'),
            );
            if (name === 'dragTo' && args[0]?.resolveSettingsLocator)
              args[0] = await args[0].resolveSettingsLocator();
            return loc[name](...args);
          };
        },
      },
    );
  };
  return new Proxy(host, {
    get(target, name) {
      if (methods.includes(name)) return (...args) => query([[name, args]]);
      const value = target[name];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
module.exports = { settingsAwarePage };
