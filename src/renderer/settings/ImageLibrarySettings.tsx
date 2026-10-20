import { useState } from 'react';
import { SettingsSection } from '../settings-ui/SettingsSections';
import { settingAnchor } from '../settings-ui/setting-anchor';
export function ImageLibrarySettings() {
  const [error, setError] = useState('');
  return (
    <div className="settings-sections">
      <SettingsSection title="登録画像" {...settingAnchor('image-library', 'images')}>
        <p>AppDockで使う画像の追加・プレビュー・グループ整理を、画像ライブラリーで行えます。</p>
        <button
          type="button"
          className="primary"
          onClick={() => {
            void window.dock
              .executeCommand('appdock.image-library.open')
              .catch((e) => setError(String(e)));
          }}
        >
          画像ライブラリーを開く
        </button>
        {error && <p role="alert">{error}</p>}
      </SettingsSection>
      <SettingsSection title="グループ" {...settingAnchor('image-library', 'groups')}>
        <p>
          画像ライブラリーの左側からグループを管理できます。同じ画像を複数のグループに整理できます。
        </p>
      </SettingsSection>
    </div>
  );
}
