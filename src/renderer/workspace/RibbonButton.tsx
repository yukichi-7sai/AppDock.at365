import { useEffect, useState } from 'react';
import type { RibbonView } from '../../shared/workspace-ui';
import { Icon, type IconName } from '../../shared/ui-icons';

export function RibbonIcon({
  item,
  asset,
}: {
  item: RibbonView['items'][number];
  asset(id: string): Promise<{ dataUrl: string; monochrome?: boolean }>;
}) {
  const [url, setUrl] = useState('');
  const [monochrome, setMonochrome] = useState(false);
  useEffect(() => {
    let live = true;
    setUrl('');
    if (item.icon.assetId)
      void asset(item.icon.assetId)
        .then((value) => {
          if (live) {
            setUrl(value.dataUrl);
            setMonochrome(value.monochrome === true);
          }
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [item.icon.assetId]);
  return (
    <>
      <span className={`ribbon-icon${item.icon.text ? ' avatar' : ''}`}>
        {url ? (
          monochrome ? (
            <span
              className="ribbon-svg-icon"
              aria-hidden="true"
              style={{ maskImage: 'url("' + url + '")' }}
            />
          ) : (
            <img src={url} alt="" />
          )
        ) : (
          item.icon.text || <Icon name={item.icon.name as IconName} size={21} />
        )}
        {item.badge && (
          <span aria-hidden="true" className={`ribbon-badge ${item.badge.kind}`}>
            {item.badge.text}
          </span>
        )}
      </span>
      {!(item.hideLabel ?? item.iconOnly) && <span className="rail-label">{item.title}</span>}
    </>
  );
}
export const ribbonLabel = (item: RibbonView['items'][number]) =>
  item.title + (item.badge ? `、${item.badge.description}` : '');
