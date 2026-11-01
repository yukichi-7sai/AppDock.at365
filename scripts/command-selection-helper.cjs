const selectionDialog = (host) => host.getByRole('dialog', { name: 'コマンドを選択', exact: true });
async function chooseCommand(host, id) {
  const dialog = selectionDialog(host);
  await dialog.getByRole('combobox', { name: 'コマンドを検索', exact: true }).fill(id);
  await dialog.locator(`[role="option"][data-command-id="${id}"]`).dblclick();
  await dialog.waitFor({ state: 'hidden' });
}
module.exports = { selectionDialog, chooseCommand };
