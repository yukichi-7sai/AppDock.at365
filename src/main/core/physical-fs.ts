import fs from 'node:fs';

/** Distribution files stay physical files, including Electron's virtual ASAR directories. */
export const physicalFs: typeof fs = process.versions.electron ? require('original-fs') : fs;
