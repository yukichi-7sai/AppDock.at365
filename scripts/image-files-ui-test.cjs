const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { launch, until } = require('./page-test-host.cjs');
const { writePng } = require('./image-file-fixture.cjs');
const root = path.resolve(__dirname, '..'),
  profile = fs.mkdtempSync(path.join(root, '.artifacts/image-files-ui-'));
const settings = require('../out/main/shared/settings-schema').createDefaultSettings();
settings.host.closeToTray = false;
settings.keybindings = [];
settings.gestures.enabled = false;
settings.updates.checkHostOnStartup =
  settings.updates.checkHostOnAboutOpen =
  settings.updates.checkAppletsOnStartup =
    false;
fs.writeFileSync(require('./test-settings.cjs').file(profile), JSON.stringify(settings));
let host,
  result,
  success = false;
(async () => {
  try {
    const source = path.join(profile, 'photo.png');
    await writePng(source, 10000, 2400, true);
    await writePng(path.join(profile, 'tall.png'), 2000, 10000);
    assert.ok(fs.statSync(source).size > 5 * 1024 * 1024);
    host = await launch(profile, process.argv[2]);
    const formats = await host.main.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 10000;
      canvas.height = 2400;
      const context = canvas.getContext('2d');
      context.fillStyle = '#2878c8';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const jpeg = canvas.toDataURL('image/jpeg');
      canvas.width = 200;
      canvas.height = 100;
      context.fillStyle = '#2878c8b4';
      context.fillRect(0, 0, 200, 100);
      const webp = canvas.toDataURL('image/webp');
      canvas.width = canvas.height = 1;
      return { jpeg, webp };
    });
    for (const [extension, data] of Object.entries(formats))
      fs.writeFileSync(
        path.join(profile, 'format.' + extension),
        Buffer.from(data.split(',')[1], 'base64'),
      );
    fs.writeFileSync(
      path.join(profile, 'wide.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="10000" height="2400"><rect width="10000" height="2400" fill="#2878c8"/></svg>',
    );
    const jpeg = fs.readFileSync(path.join(profile, 'format.jpeg'));
    const exif = Buffer.from(
      'ffe1002245786966000049492a0008000000010012010300010000000600000000000000',
      'hex',
    );
    fs.writeFileSync(
      path.join(profile, 'oriented.jpeg'),
      Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]),
    );
    result = await host.app.evaluate(
      async (electron, input) => {
        const req = process
          .getBuiltinModule('module')
          .createRequire(electron.app.getAppPath() + '/package.json');
        const fs = req('node:fs/promises'),
          sync = req('node:fs'),
          path = req('node:path');
        const { RegisteredImages } = req('./out/main/main/core/registered-images');
        const { decodeRegisteredImage } = req('./out/main/main/core/registered-image-decoder');
        const { GalleryImages } = req('./out/main/main/core/gallery-images');
        const { AssignedImages } = req('./out/main/main/core/assigned-images');
        const { originalImageSources } = req('./out/main/main/core/image-file-source');
        const { fileHash } = req('./out/main/main/core/file-content');
        const { renameLibraryFiles } = req('./out/main/main/core/library-file-rename');
        const { decodeRegisteredImageFile } = req('./out/main/main/core/image-file-decoder');
        const orientedExpected = electron.nativeImage
          .createFromBuffer(await fs.readFile(path.join(input.profile, 'oriented.jpeg')))
          .getSize();
        const library = new RegisteredImages(
          path.join(input.profile, 'data/assets/images'),
          decodeRegisteredImage,
        );
        const gallery = new GalleryImages(library),
          view = gallery.session();
        const originalRead = fs.readFile,
          originalSyncRead = sync.readFileSync,
          originalString = Buffer.prototype.toString;
        const memoryBefore = process.memoryUsage();
        fs.readFile = async function (file, ...args) {
          if (typeof file === 'string' && /\.(png|jpe?g|webp)$/i.test(file))
            throw Error('Whole raster read in main');
          return originalRead.call(this, file, ...args);
        };
        sync.readFileSync = function (file, ...args) {
          if (typeof file === 'string' && /\.(png|jpe?g|webp)$/i.test(file))
            throw Error('Whole raster sync read in main');
          return originalSyncRead.call(this, file, ...args);
        };
        Buffer.prototype.toString = function (encoding, ...args) {
          if (encoding === 'base64' && this.length > 5 * 1024 * 1024)
            throw Error('Original raster Base64 in main');
          return originalString.call(this, encoding, ...args);
        };
        let stage = 'add large PNG';
        try {
          const added = await library.addFile(input.source, 'photo.png');
          const entry = library.entry(added.ref);
          if (entry.width !== 10000 || entry.height !== 2400 || entry.thumbnail)
            throw Error('Unexpected metadata/resident thumbnail');
          const thumbnail = await view.get(added.ref, added.generation, 512);
          const size = electron.nativeImage.createFromDataURL(thumbnail).getSize();
          if (size.width !== 512 || size.height !== 123)
            throw Error('Unexpected thumbnail dimensions');
          const same = await view.get(added.ref, added.generation, 512);
          if (same !== thumbnail) throw Error('Thumbnail not shared');
          const saved = await library.readFile(added.ref, added.generation, {
            cachePreview: false,
          });
          const assigned = new AssignedImages(library.directory);
          const retained = await assigned.retainFile(added.ref, saved.hash, () => {});
          const syncRetained = assigned.retain(added.ref);
          if (
            retained.file !== syncRetained.file ||
            (await fileHash(library.file(retained.file))) !== saved.hash
          )
            throw Error('Retained copy mismatch');
          const variants = [];
          for (const [name, width, height] of [
            ['tall.png', 2000, 10000],
            ['format.jpeg', 10000, 2400],
            ['oriented.jpeg', orientedExpected.width, orientedExpected.height],
            ['format.webp', 200, 100],
            ['wide.svg', 10000, 2400],
          ]) {
            stage = name;
            const added = await library.addFile(path.join(input.profile, name), name);
            const entry = library.entry(added.ref);
            if (entry.width !== width || entry.height !== height)
              throw Error('Format dimensions: ' + name);
            const derivative = await view.get(added.ref, added.generation, 512);
            if (electron.nativeImage.createFromDataURL(derivative).isEmpty())
              throw Error('Format decode: ' + name);
            variants.push({ name, width, height });
          }
          stage = 'transactions';
          const copy = await library.addFile(input.source, 'transaction.png');
          let rejected = false;
          try {
            await renameLibraryFiles(
              library,
              [library.entry(copy.ref)],
              ['renamed.png'],
              () => () => {
                throw Error('save failed');
              },
            );
          } catch (error) {
            rejected = error.message === 'save failed';
          }
          if (!rejected || (await fileHash(library.file(copy.ref.file))) !== saved.hash)
            throw Error('Rename rollback failed');
          await renameLibraryFiles(
            library,
            [library.entry(copy.ref)],
            ['renamed.png'],
            () => () => {},
          );
          const renamed = { file: 'renamed.png' };
          rejected = false;
          try {
            await library.remove(renamed, library.entry(renamed).generation, {
              trash: (file) => fs.unlink(file),
              prepare: () => () => {
                throw Error('save failed');
              },
            });
          } catch (error) {
            rejected = error.message === 'save failed';
          }
          if (!rejected || (await fileHash(library.file(renamed.file))) !== saved.hash)
            throw Error('Delete rollback failed');
          await library.remove(renamed, library.entry(renamed).generation, {
            trash: (file) => fs.unlink(file),
            prepare: () => () => {},
          });
          if ((await fs.readdir(library.directory)).some((name) => name.startsWith('.')))
            throw Error('Temporary recovery files remain');
          const alpha = electron.nativeImage
            .createFromDataURL(
              (await decodeRegisteredImageFile(path.join(input.profile, 'tall.png'), 512))
                .thumbnail,
            )
            .toBitmap()[3];
          if (Math.abs(alpha - 180) > 1) throw Error('Transparency was lost');
          stage = 'independent decoder lifetime';
          await decodeRegisteredImage(
            Buffer.from(
              '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16"/></svg>',
            ),
          );
          const decoderWindow = electron.BrowserWindow.getAllWindows().find((window) =>
            window.webContents.getURL().includes('AppDock%20Image%20Decoder'),
          );
          if (!decoderWindow) throw Error('File decoder was not created');
          const contents = decoderWindow.webContents,
            execute = contents.executeJavaScript;
          contents.executeJavaScript = function (script) {
            return execute.call(
              this,
              `new Promise(resolve => setTimeout(resolve, 1200)).then(() => ${script})`,
            );
          };
          try {
            await decodeRegisteredImageFile(path.join(input.profile, 'tall.png'), 512);
            let live = true;
            contents.executeJavaScript = function (script) {
              live = false;
              return execute.call(this, script);
            };
            let cancelled = false;
            try {
              await decodeRegisteredImageFile(
                path.join(input.profile, 'tall.png'),
                512,
                undefined,
                () => live,
              );
            } catch (error) {
              cancelled =
                error instanceof req('./out/main/main/core/registered-assets').LibraryReadCancelled;
            }
            if (!cancelled) throw Error('Closed image view did not return typed cancellation');
          } finally {
            if (!contents.isDestroyed()) contents.executeJavaScript = execute;
          }
          const url = await view.preview(added.ref, true);
          if (!url.startsWith('appdock://host/library-original/'))
            throw Error('Original not file-backed');
          globalThis.imageFileFixture = { library, gallery, view, url, originalImageSources };
          return {
            version: electron.app.getVersion(),
            bytes: entry.bytes,
            dimensions: [entry.width, entry.height],
            thumbnail: size,
            originalUrl: url,
            retained: retained.file,
            variants,
            alpha,
            transactions: true,
            independentDecoderLifetime: true,
            memoryBefore,
            memoryAfter: process.memoryUsage(),
          };
        } catch (error) {
          return {
            failure:
              stage +
              ': ' +
              String(error?.stack ?? JSON.stringify(error, Object.getOwnPropertyNames(error))),
          };
        } finally {
          fs.readFile = originalRead;
          sync.readFileSync = originalSyncRead;
          Buffer.prototype.toString = originalString;
        }
      },
      { profile, source },
    );
    if (result.failure) throw Error(result.failure);
    const natural = await host.main.evaluate(
      (url) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => {
            resolve([image.naturalWidth, image.naturalHeight]);
            image.src = '';
          };
          image.onerror = () => reject(Error('Original preview failed'));
          image.src = url;
        }),
      result.originalUrl,
    );
    assert.deepEqual(natural, [10000, 2400]);
    const released = await host.app.evaluate(async () => {
      const f = globalThis.imageFileFixture;
      f.view.dispose();
      const status = f.originalImageSources.response(new Request(f.url)).status;
      f.library.stop();
      return { status, cache: f.gallery.cache.size, bytes: f.gallery.bytes };
    });
    assert.deepEqual(released, { status: 404, cache: 0, bytes: 0 });
    await host.main.evaluate(() => window.dock.executeCommand('appdock.image-library.open'));
    const card = host.main
      .locator('.ad-gallery-card')
      .filter({ has: host.main.locator('h3', { hasText: 'photo.png' }) });
    await card.getByRole('button', { name: 'photo.pngを選択', exact: true }).dblclick();
    const dialog = host.main.getByRole('dialog', { name: 'photo.png', exact: true });
    await until(
      () =>
        dialog
          .locator('img')
          .evaluate(
            (image) =>
              image.complete && image.naturalWidth === 10000 && image.naturalHeight === 2400,
          ),
      'large photo dialog',
    );
    assert.match(
      await dialog.locator('img').getAttribute('src'),
      /^appdock:\/\/host\/library-original\//,
    );
    await dialog.screenshot({ path: path.join(profile, 'large-photo.png') });
    await host.main.keyboard.press('Escape');
    result.galleryDialog = true;
    assert.equal(result.version, require('../package.json').version);
    success = true;
  } finally {
    if (host) await host.close();
    fs.writeFileSync(
      path.join(profile, 'result.json'),
      JSON.stringify({ success, ...result }, null, 2),
    );
    console.log(JSON.stringify({ profile, success, ...result }));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
