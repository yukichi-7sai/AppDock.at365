const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, '.artifacts', 'image-library-fixtures');
const projects = [
  [
    'publish',
    path.join(
      root,
      'tests/fixtures/dotnet/AppDock.RegisteredImages/AppDock.RegisteredImages.csproj',
    ),
    'dotnet-fixture',
  ],
  ...['Watch', 'WindowsTools', 'WallpaperSlideshow'].map((name) => [
    'build',
    path.resolve(root, `../Applet.${name}.at365`, `Applet.${name}`, `Applet.${name}.csproj`),
    `native-${name}`,
  ]),
];
for (const [command, project, name] of projects) {
  const result = spawnSync(
    'dotnet',
    [command, project, '-c', 'Release', '-o', path.join(output, name)],
    { cwd: root, windowsHide: true, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
