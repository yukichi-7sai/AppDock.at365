import { hostText } from '../../shared/i18n';
import type { ExtensionManifest } from '../../shared/contracts';
import { validateSettingValue } from '../../shared/setting-definitions';
import type { SettingListDraftResult } from '../../shared/setting-list-draft';
import type { RegisteredImageRef } from '../../shared/registered-images';
interface Provider {
  manifest: ExtensionManifest;
  state: string;
  runtimeSession?: string;
  peer?: { closed: boolean; request(method: string, params: unknown): Promise<any> } | null;
}
/** The settings page binds the owner; only the list's declared action can run. */
export async function settingListDraftAction(
  owner: Provider,
  key: unknown,
  request: any,
  importImage: (input: { base64: string }) => Promise<RegisteredImageRef>,
): Promise<SettingListDraftResult | RegisteredImageRef> {
  const denied = () => {
    throw Error(hostText('settings.index.invalidInput'));
  };
  const definition = owner.manifest.settings?.find((definition) => definition.key === key);
  const action = definition?.list?.draftAction;
  if (!definition || !action || !request || typeof request !== 'object') return denied();
  if (request.kind === 'image') {
    if (
      !definition.list?.imageKey ||
      !owner.manifest.capabilities?.includes('registered-images') ||
      typeof request.base64 !== 'string' ||
      request.base64.length > 350000
    )
      return denied();
    return importImage({ base64: request.base64 });
  }
  const declaration = owner.manifest.pageActions?.find(
    (declaration) => declaration.id === action.id,
  );
  if (
    request.kind !== 'fetch' ||
    typeof request.input !== 'string' ||
    request.input.length > 4096 ||
    !declaration ||
    Object.keys(declaration.parameters ?? {}).length !== 1 ||
    declaration.parameters?.[action.inputKey] !== 'string'
  )
    return denied();
  if (owner.state !== 'running' || !owner.peer || owner.peer.closed)
    throw Error(hostText('services.hostApi.pageProviderStopped'));
  const generation = owner.runtimeSession,
    peer = owner.peer;
  const raw = await peer.request('page.action', {
    id: action.id,
    input: { [action.inputKey]: request.input },
    pageId: `settings:${definition.key}`,
  });
  if (
    owner.state !== 'running' ||
    owner.runtimeSession !== generation ||
    owner.peer !== peer ||
    peer.closed
  )
    throw Error(hostText('services.hostApi.pageProviderStopped'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return denied();
  const result: SettingListDraftResult = { values: {} };
  for (const key of action.fields) {
    if (raw[key] === undefined) continue;
    const field = definition.fields!.find((field) => field.key === key)!;
    validateSettingValue(field, raw[key]);
    result.values[key] = structuredClone(raw[key]);
  }
  if (raw.message !== undefined) {
    if (typeof raw.message !== 'string' || raw.message.length > 1000) return denied();
    result.message = raw.message;
  }
  if (raw.imageBytes !== undefined && definition.list?.imageKey) {
    if (
      !Array.isArray(raw.imageBytes) ||
      !raw.imageBytes.length ||
      raw.imageBytes.length > 256000 ||
      raw.imageBytes.some(
        (value: unknown) => !Number.isInteger(value) || Number(value) < 0 || Number(value) > 255,
      )
    )
      return denied();
    const bytes = Buffer.from(raw.imageBytes);
    const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpeg) return denied();
    const base64 = bytes.toString('base64');
    result.image = { base64, preview: `data:image/${png ? 'png' : 'jpeg'};base64,${base64}` };
  }
  return result;
}
