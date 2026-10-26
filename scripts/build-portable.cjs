const path = require('node:path');
const { createRequire } = require('node:module');
const { build, Platform } = require('electron-builder');
const builderRequire = createRequire(require.resolve('electron-builder'));
const root = path.resolve(__dirname, '..');
async function buildPortable(config) {
  return await build({
    projectDir: root,
    targets: Platform.WINDOWS.createTarget('dir', builderRequire('builder-util').Arch.x64),
    publish: 'never',
    config: {
      ...config,
      directories: { output: path.join(root, '.artifacts/host-build'), ...config?.directories },
    },
  });
}
exports.buildPortable = buildPortable;
if (require.main === module)
  buildPortable(process.argv.includes('--store') ? { compression: 'store' } : undefined).catch(
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
