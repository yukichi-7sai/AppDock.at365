import { useHostTranslation } from '../HostTranslation';
import { useEffect, useRef } from 'react';
import {
  mountImageGallery,
  mountGallerySizeControl,
  mountGalleryPreview,
  type GalleryModel,
  type GalleryOptions,
  type GalleryPreviewModel,
} from '../../../ui/image-gallery';
import '../../../ui/image-gallery/gallery.css';

export function ImageGallery({
  model,
  options,
  resetKey,
}: {
  model: GalleryModel;
  options: Omit<GalleryOptions, 'scrollElement'>;
  resetKey?: string;
}) {
  const { t: translate } = useHostTranslation();
  const container = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const current = useRef({ model, options });
  current.current = { model, options };
  const mounted = useRef<ReturnType<typeof mountImageGallery>>(null);
  useEffect(() => {
    const view = mountImageGallery(container.current!, {
      scrollElement: scroll.current!,
      image: (id, edge) => current.current.options.image(id, edge),
      select: (id, selected) => current.current.options.select(id, selected),
      activate: (id) => current.current.options.activate(id),
      action: (id, action) => current.current.options.action(id, action),
    });
    mounted.current = view;
    view.setModel(current.current.model);
    return () => {
      mounted.current = null;
      view.dispose();
    };
  }, []);
  useEffect(() => {
    mounted.current?.setModel(model);
  }, [model]);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [resetKey]);
  return (
    <div className="image-picker-scroll" ref={scroll}>
      <div
        ref={container}
        role="group"
        aria-label={translate('settings.imageGallery.registeredImages')}
      />
    </div>
  );
}
export function GallerySizeControl({
  value,
  onChange,
  onCommit,
}: {
  value: number;
  onChange(value: number): void;
  onCommit(value: number): void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const current = useRef({ value, onChange, onCommit });
  current.current = { value, onChange, onCommit };
  const mounted = useRef<ReturnType<typeof mountGallerySizeControl>>(null);
  useEffect(() => {
    const view = mountGallerySizeControl(container.current!, {
      value: current.current.value,
      change: (value) => current.current.onChange(value),
      commit: (value) => current.current.onCommit(value),
    });
    mounted.current = view;
    return () => {
      mounted.current = null;
      view.dispose();
    };
  }, []);
  useEffect(() => {
    mounted.current?.setValue(value);
  }, [value]);
  return <div className="image-picker-size" ref={container} />;
}
export function ImageGalleryPreview({
  model,
  image,
}: {
  model: GalleryPreviewModel;
  image(assetId: string): Promise<string>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const current = useRef({ model, image });
  current.current = { model, image };
  const mounted = useRef<ReturnType<typeof mountGalleryPreview>>(null);
  useEffect(() => {
    const view = mountGalleryPreview(container.current!, {
      image: (id) => current.current.image(id),
    });
    mounted.current = view;
    view.setModel(current.current.model);
    return () => {
      mounted.current = null;
      view.dispose();
    };
  }, []);
  useEffect(() => {
    mounted.current?.setModel(model);
  }, [model]);
  return <div className="image-gallery-preview-content" ref={container} />;
}
