const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { launch, until } = require('./page-test-host.cjs');
const root = path.resolve(__dirname, '..');
const expectedHostVersion = require('../package.json').version;
const profile = path.join(root, '.artifacts', 'dotnet-pages-ui-' + Date.now());
const portable = process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : null;
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.hardwareAcceleration = false; settings.host.closeToTray = false;
settings.globalShortcutCommands = []; settings.gestures.enabled = false;
settings.updates.checkHostOnStartup = false; settings.updates.checkAppletsOnStartup = false;
const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
for (const mode of ['dotnet','native','node']) {
  const folder = path.join(profile, 'extensions/pages-' + mode), id = 'test.pages.' + mode;
  fs.mkdirSync(folder, { recursive: true });
  if (mode !== 'node') fs.cpSync(path.join(root, `tests/fixtures/dotnet/AppDock.PageProbe${mode === 'native' ? '.Native' : ''}/bin/Release/net10.0`), folder, { recursive: true });
  const manifest = { apiVersion: 1, id, name: 'Page fixture ' + mode, version: '1.0.0', minimumHostVersion: '0.66.1', startupDelaySeconds: 0,
    runtime: mode, entry: mode === 'node' ? 'worker.cjs' : mode === 'native' ? 'AppDock.PageProbe.Native.exe' : 'AppDock.PageProbe.dll',
    ...(mode === 'dotnet' ? { type: 'AppDock.Tests.PageProbe' } : {}), capabilities: ['ui','pages','dynamic-pages','local-images'],
    commands: [{ id: id + '.open', title: 'Open ' + mode, activateOnExecute: true }, { id: id + '.details', title: 'Details ' + mode }],
    pages: [{ id: 'main', title: 'Pages ' + mode, source: 'local', ui: 'index.html', openCommand: id + '.open' }],
    pageActions: [{ id: 'echo', parameters: { value: 'string' } }, { id: 'null' }, { id: 'images' }, { id: 'pages' }, { id: 'release', parameters: { imageId: 'string' } }],
  };
  fs.writeFileSync(path.join(folder, 'extension.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(folder, 'index.html'), `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';script-src 'self';img-src appdock:"><script src="ui.js" defer></script></head><body><h1>Pages ${mode}</h1><input aria-label="保持する入力"><img id="image" alt="Fixture"><output id="changes">0</output></body></html>`);
  fs.writeFileSync(path.join(folder, 'ui.js'), `let changes=0; window.appletPage.onChanged(()=>document.getElementById('changes').textContent=String(++changes));`);
  if (mode === 'node') fs.writeFileSync(path.join(folder, 'worker.cjs'), `let context; exports.activate=async c=>{context=c;c.commands.register('${id}.open','Open node',()=>c.pages.open('main'));c.commands.register('${id}.details','Details node',()=>c.ui.openDetails());};
exports.onPageAction=async(id,input,pageId)=>{if(pageId!=='main')throw Error('Unknown page');if(id==='echo')return input;if(id==='null')return null;if(id==='pages'){const before=await context.pages.list();const result=await context.pages.replace([{id:'dynamic',title:'Dynamic',source:'local',ui:'index.html',context:{document:'one'}}],before.revision);await context.pages.hide('dynamic');await context.pages.dispose('dynamic');return result;}if(id==='images'){const fs=require('node:fs'),path=require('node:path');const file=path.join(await context.ui.getImageDirectory(),'probe.png');fs.writeFileSync(file,Buffer.from('${pixel}','base64'));const result=await context.pages.registerImages('main',[{key:'probe',file}]);await context.pages.notifyChanged('main');return result;}if(id==='release')return context.pages.releaseImages('main',[input.imageId]);throw Error('Unknown action');};`);
  settings.extensions[id] = { enabled: true, settings: {} };
}
// These owner/page pairs would collide if a Session name just joined both IDs with '-'.
const collisionPages = [['collision-a','test.pages-a','main'],['collision-b','test.pages','a-main']];
for (const [tag,id,pageId] of collisionPages) {
  const folder = path.join(profile, 'extensions', tag); fs.mkdirSync(folder, { recursive:true });
  fs.writeFileSync(path.join(folder,'extension.json'),JSON.stringify({ apiVersion:1,id,name:tag,version:'1.0.0',minimumHostVersion:'0.66.1',runtime:'node',entry:'worker.cjs',startupDelaySeconds:0,
    capabilities:['pages','local-images'],commands:[{id:id+'.open',title:tag,activateOnExecute:true}],
    pages:[{id:pageId,title:tag,source:'local',ui:'index.html',openCommand:id+'.open'}],pageActions:[{id:'images'}] }));
  fs.writeFileSync(path.join(folder,'index.html'),'<!doctype html><html><body><h1>Page isolation</h1></body></html>');
  fs.writeFileSync(path.join(folder,'worker.cjs'),`let c;exports.activate=async value=>{c=value;c.commands.register('${id}.open','Open',()=>c.pages.open('${pageId}'));};
exports.onPageAction=async()=>{const fs=require('node:fs'),path=require('node:path');const file=path.join(await c.ui.getImageDirectory(),'pixel.png');fs.writeFileSync(file,Buffer.from('${pixel}','base64'));return c.pages.registerImages('${pageId}',[{key:'pixel',file}]);};`);
  settings.extensions[id]={enabled:true,settings:{}};
}
fs.writeFileSync(require('./test-settings.cjs').file(profile, 'settings.json'), JSON.stringify(settings));
const checks = [];
let instance;
(async () => {
  try {
    instance = await launch(profile, portable);
    let foreignUrl;
    for (const mode of ['dotnet','native','node']) {
      const id = 'test.pages.' + mode;
      await until(async () => (await instance.main.evaluate(() => window.dock.snapshot())).extensions.find(e => e.id === id)?.state === 'running', mode + ' running');
      await instance.main.evaluate(id => window.dock.executeCommand(id + '.open'), id);
      const ui = await instance.page('/pages-' + mode + '/index.html');
      const invoke = (id, input = {}) => ui.evaluate(({id,input}) => window.appletPage.call('actions.invoke',{id,input}), {id,input});
      assert.deepEqual(await invoke('echo', { value: '日本語 echo' }), { value: '日本語 echo' }); assert.equal(await invoke('null'), null);
      await ui.getByRole('textbox', { name: '保持する入力' }).fill('preserved-' + mode);
      const { images: [image] } = await invoke('images');
      await ui.locator('#image').evaluate((node, url) => node.src = url, image.url);
      await until(() => ui.locator('#image').evaluate(node => node.complete && node.naturalWidth === 1), mode + ' decoded image');
      await until(() => ui.locator('#changes').textContent().then(value => Number(value) > 0), mode + ' changed event');
      const fetchStatus = url => instance.app.evaluate(async ({session}, {partition,url}) => { const response=await session.fromPartition(partition).fetch(url); await response.arrayBuffer(); return response.status; }, { partition: `applet-page:page:${id}:main`, url });
      if (foreignUrl) assert.equal(await fetchStatus(foreignUrl), 404, 'foreign page image is private');
      assert.equal(await fetchStatus(image.url), 200);
      await invoke('release', { imageId: image.id }); assert.equal(await fetchStatus(image.url), 404);
      const second = (await invoke('images')).images[0]; foreignUrl = second.url;
      await invoke('pages');
      await instance.main.evaluate(id => window.dock.executeCommand(id + '.pages.dynamic.open'), id);
      await until(async () => instance.app.context().pages().filter(p => p.url().endsWith('/pages-' + mode + '/index.html')).length === 2, 'dynamic View created');
      const dynamic = instance.app.context().pages().find(p => p !== ui && p.url().endsWith('/pages-' + mode + '/index.html'));
      assert.equal(await dynamic.evaluate(() => window.appletPage.snapshot().then(s => s.page.context.document)), 'one');
      await invoke('pages'); await until(() => dynamic.isClosed(), 'dynamic View disposed');
      await instance.main.evaluate(id => window.dock.executeCommand(id + '.open'), id);
      assert.equal(await ui.getByRole('textbox', { name: '保持する入力' }).inputValue(), 'preserved-' + mode);
      await instance.main.evaluate(id => window.dock.executeCommand(id + '.details'), id);
      await until(() => instance.main.evaluate(async id => (await window.dock.settingsEditing()).pageId === 'applets' && (await window.dock.snapshot()).navigation.appletId === id, id), 'own Applet in management');
      await instance.main.evaluate(id => window.dock.toggleExtension(id, false), id);
      await until(() => ui.isClosed(), mode + ' View closed on stop'); assert.equal(await fetchStatus(second.url), 404);
      checks.push(mode + ': real local page / JSON-null / PNG and change event / private URLs / release / dynamic context and disposal / retained input / own details / stop');
    }
    const references = [];
    for (const [tag,id] of collisionPages) {
      await until(async () => (await instance.main.evaluate(() => window.dock.snapshot())).extensions.find(e=>e.id===id)?.state==='running',tag+' running');
      await instance.main.evaluate(id=>window.dock.executeCommand(id+'.open'),id);
      const ui=await instance.page('/'+tag+'/index.html');
      references.push((await ui.evaluate(()=>window.appletPage.call('actions.invoke',{id:'images',input:{}}))).images[0].url);
    }
    const isolation=await instance.app.evaluate(async ({webContents},urls)=>{
      const contents=['collision-a','collision-b'].map(tag=>webContents.getAllWebContents().find(w=>w.getURL().endsWith('/'+tag+'/index.html')));
      const statuses=[];for(const contentsItem of contents){const row=[];for(const url of urls){const response=await contentsItem.session.fetch(url);await response.arrayBuffer();row.push(response.status);}statuses.push(row);}
      return {sharedSession:contents[0].session===contents[1].session,statuses};
    },references);
    assert.equal(isolation.sharedSession,false,'different owner/page pairs have different live Sessions');
    assert.deepEqual(isolation.statuses,[[200,404],[404,200]],'both owners stay running; each View can fetch only its own images');
    for(const [,id] of collisionPages)await instance.main.evaluate(id=>window.dock.toggleExtension(id,false),id);
    checks.push('colliding owner/page ID text: separate live Sessions / own images 200 / other live owner images 404');
    const hostSha256 = instance.hash;
    const runtime = await instance.app.evaluate(({ app }) => {
      const read = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
      const bytes = read('fs').readFileSync(read('path').join(app.getAppPath(), 'out/shells/default/extension.json'));
      return { version: app.getVersion(), defaultShellVersion: JSON.parse(bytes).version,
        shellManifestSha256: read('crypto').createHash('sha256').update(bytes).digest('hex') };
    });
    assert.equal(runtime.version, expectedHostVersion); assert.equal(runtime.defaultShellVersion, runtime.version);
    await instance.close(); instance = undefined;
    fs.writeFileSync(path.join(profile, 'result.json'), JSON.stringify({ ok: true, portable, hostSha256, runtime, checks }, null, 2));
    console.log(JSON.stringify({ ok: true, profile, checks }));
  } catch(error) { fs.writeFileSync(path.join(profile,'result.json'),JSON.stringify({ok:false,checks,error:error.stack},null,2)); throw error; }
  finally { if (instance) await instance.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
