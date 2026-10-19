/** Find the active title/status View through its public bridge, including custom providers. */
async function barPage(host, region) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const state = (await host.evaluate(() => window.dock.snapshot())).shellRegions?.regions.find(
      (r) => r.region === region,
    );
    if (state?.ready)
      for (const page of host.context().pages()) {
        if (page === host) continue;
        try {
          const connection = await page.evaluate(() => window.appdockBar?.connect());
          if (
            connection?.snapshot.region === region &&
            connection.providerAppletId === state.boundProvider
          )
            return page;
        } catch {}
      }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error('Shell bar did not become ready: ' + region);
}
module.exports = { barPage };
