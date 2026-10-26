const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function main() {
  const { build } = await import('vite');
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'out/ui/image-gallery');
  await build({
    configFile: false,
    build: {
      outDir: output,
      emptyOutDir: true,
      lib: {
        entry: path.join(root, 'ui/image-gallery/index.ts'),
        formats: ['es'],
        fileName: () => 'image-gallery.js',
      },
    },
  });
  require('./copy-host.cjs').copyHost(
    path.join(root, 'ui/image-gallery/gallery.css'),
    path.join(output, 'gallery.css'),
  );
  const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const files = Object.fromEntries(
    ['image-gallery.js', 'gallery.css'].map((name) => [name, hash(path.join(output, name))]),
  );
  const sourceFiles = [
    'ui/image-gallery/index.ts',
    'ui/image-gallery/gallery.css',
    'src/shared/image-gallery.ts',
  ];
  fs.writeFileSync(
    path.join(output, 'manifest.json'),
    JSON.stringify(
      {
        apiVersion: 1,
        version: require('../package.json').version,
        files,
        sources: Object.fromEntries(sourceFiles.map((name) => [name, hash(path.join(root, name))])),
      },
      null,
      2,
    ) + '\n',
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
