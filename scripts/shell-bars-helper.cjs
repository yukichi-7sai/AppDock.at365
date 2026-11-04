/** Locate a host-owned title/status surface by its private connection. */
async function barPage(host, region) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    for (const page of host.context().pages()) {
      if (!page.url().endsWith('/renderer/workspace/bars.html')) continue;
      try {
        const connection = await page.evaluate(() => window.appdockBar?.connect());
        if (connection?.snapshot.region === region) return page;
      } catch {}
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw Error('Window bar did not become ready: ' + region);
}
module.exports = { barPage };
