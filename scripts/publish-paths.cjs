const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

function getPrimaryCheckout(repository) {
  // Linked worktrees can live several directories below the primary checkout.
  if (fs.statSync(path.join(repository, '.git'), { throwIfNoEntry: false })?.isFile()) {
    const commonDirectory = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: repository, encoding: 'utf8', windowsHide: true },
    ).trim();
    if (!path.isAbsolute(commonDirectory) || path.basename(commonDirectory) !== '.git')
      throw Error('Cannot resolve the primary checkout for this worktree.');
    return path.dirname(commonDirectory);
  }
  return repository;
}

function getPublishDirectory(repository) {
  repository = getPrimaryCheckout(repository);
  return path.resolve(repository, '../../40.ARTIFACT', path.basename(repository));
}

module.exports = { getPrimaryCheckout, getPublishDirectory };
