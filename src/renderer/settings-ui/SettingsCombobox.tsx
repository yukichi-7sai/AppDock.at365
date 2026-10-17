import { useId, useLayoutEffect, useRef, useState } from 'react';
import { SettingsInput } from './SettingsInput';

/** Editable suggestions rendered inside the settings surface, including its top layer. */
export function SettingsCombobox({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange(value: string): void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const matches = options.filter((option) =>
    `${option.id} ${option.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const visible = open && matches.length > 0;
  const show = () => {
    setQuery('');
    setActive(-1);
    setOpen(true);
  };
  const choose = (index: number) => {
    if (!matches[index]) return;
    onChange(matches[index].id);
    setOpen(false);
    input.current?.focus();
  };
  useLayoutEffect(() => {
    const list = popup.current;
    if (!visible || !list) return;
    const position = () => {
      const rect = input.current!.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const upward = below < Math.min(list.scrollHeight, 220) && above > below;
      list.style.left = `${rect.left}px`;
      list.style.width = `${rect.width}px`;
      list.style.maxHeight = `${Math.max(0, Math.min(220, upward ? above : below))}px`;
      list.style.top = `${upward ? rect.top - list.getBoundingClientRect().height - 4 : rect.bottom + 4}px`;
    };
    list.showPopover();
    position();
    const outside = (event: PointerEvent) => {
      if (
        !list.contains(event.target as Node) &&
        !input.current?.parentElement?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const resize = new ResizeObserver(position);
    resize.observe(input.current!);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('pointerdown', outside);
    return () => {
      if (list.isConnected && list.matches(':popover-open')) list.hidePopover();
      resize.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      document.removeEventListener('pointerdown', outside);
    };
  }, [visible, matches.length]);
  useLayoutEffect(() => {
    if (visible && active >= 0)
      popup.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [visible, active]);
  return (
    <div className="settings-combobox">
      <SettingsInput
        ref={input}
        role="combobox"
        aria-label={label}
        aria-expanded={visible}
        aria-controls={visible ? id : undefined}
        aria-autocomplete="list"
        aria-activedescendant={visible && matches[active] ? `${id}-${active}` : undefined}
        autoComplete="off"
        placeholder={label}
        value={value}
        onClick={() => {
          if (!visible) show();
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setQuery(event.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!visible) show();
            else
              setActive((current) =>
                current < 0
                  ? event.key === 'ArrowDown'
                    ? 0
                    : matches.length - 1
                  : (current + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) %
                    matches.length,
              );
          } else if (event.key === 'Enter' && visible && active >= 0) {
            event.preventDefault();
            choose(active);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if (event.key === 'Tab') setOpen(false);
        }}
      />
      <button
        type="button"
        className="settings-combobox-toggle"
        aria-label={`${label}の候補を表示`}
        aria-expanded={visible}
        disabled={options.length === 0}
        tabIndex={-1}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          input.current?.focus();
          if (visible) setOpen(false);
          else show();
        }}
      >
        ▾
      </button>
      <div
        ref={popup}
        id={id}
        popover="manual"
        role="listbox"
        aria-label={`${label}の候補`}
        className="settings-combobox-options"
      >
        {matches.map((option, index) => (
          <div
            key={option.id}
            id={`${id}-${index}`}
            role="option"
            aria-selected={active === index}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}
          >
            <span>{option.id}</span>
            {option.name !== option.id && <small>{option.name}</small>}
          </div>
        ))}
      </div>
    </div>
  );
}
