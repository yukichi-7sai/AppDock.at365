/** Locate the independent overlay surface rather than the host renderer. */
exports.ribbonPage = async (host) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const page = host
      .context()
      .pages()
      .find((p) => /\/shells\/default\/index\.html$/.test(p.url()));
    if (page) {
      await page.locator('.activity-rail').waitFor();
      return page;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error('Default Shell ribbon did not become ready');
};
exports.closingAction = async (action) => {
  try {
    await action;
  } catch (e) {
    if (!/Target page, context or browser has been closed/.test(String(e))) throw e;
  }
};
exports.overlayPage = async (host) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const page = host
      .context()
      .pages()
      .find((p) => p.url().endsWith('/overlay.html'));
    if (page) {
      await page.locator('.command-palette').waitFor();
      return page;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error('Shell overlay did not become ready');
};
exports.logsPage = async (host, scope) => {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const model = await host.evaluate(() => window.dock.pages.get());
    if (
      model?.kind === 'logs' &&
      (!scope || (model.content.scope.type === scope.type && model.content.scope.id === scope.id))
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await host.locator('.log-toolbar').waitFor();
  return host;
};
exports.startupPage = async (host) => {
  await host.locator('.about-page').waitFor();
  return host;
};
