const fs = require('node:fs');
const path = require('node:path');

// A declared Applet replaces the former host-owned text field in settings UI tests.
exports.installProfileSettings = (root, settings, name = 'ユーザー') => {
  const directory = path.join(root, 'extensions', 'fixture.profile');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'extension.json'),
    JSON.stringify({
      apiVersion: 1,
      id: 'fixture.profile',
      name: 'Profile fixture',
      displayName: 'プロフィール',
      version: '1.0.0',
      minimumHostVersion: '0.69.0',
      runtime: 'node',
      entry: 'index.cjs',
      capabilities: ['settings', 'ribbon-items'],
      settings: [
        { key: 'name', title: 'ユーザー名', type: 'string', default: 'ユーザー' },
        { key: 'avatar', title: 'アバター画像', type: 'registered-image', default: null },
      ],
      ribbonItems: [
        {
          id: 'main',
          title: 'プロフィール',
          action: 'settings',
          icon: 'user',
          imageSetting: 'avatar',
          imageShape: 'circle',
          iconOnly: true,
          defaultPlacement: 'bottom',
        },
      ],
    }),
  );
  fs.writeFileSync(path.join(directory, 'index.cjs'), 'module.exports = {};');
  settings.extensions['fixture.profile'] = { enabled: true, settings: { name, avatar: null } };
};
