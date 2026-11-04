import { useId, useLayoutEffect, useRef, useState, useEffect, useMemo } from 'react';
import type { DragEvent } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { Icon } from '../../shared/ui-icons';
import {
  moveOrderList,
  orderListBlocks,
  type OrderListItem,
  type OrderListTarget,
} from '../../shared/order-list';

/** Shared interaction for both display order and execution order. Ownership never changes here. */
export function SettingsOrderList({
  items,
  label,
  disabled = false,
  onChange,
}: {
  items: OrderListItem[];
  label: string;
  disabled?: boolean;
  onChange(ids: string[], message: string): void;
}) {
  const { t } = useHostTranslation();
  const id = useId();
  const blocks = useMemo(() => orderListBlocks(items), [items]);
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(blocks.filter((block) => block.group).map((block) => block.key)),
  );
  const [over, setOver] = useState<{ target: OrderListTarget; after: boolean }>();
  const [dragging, setDragging] = useState<OrderListTarget>();
  const dragged = useRef<OrderListTarget | undefined>(undefined);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const moved = useRef<string | undefined>(undefined);
  const keyOf = (target: OrderListTarget) => JSON.stringify([target.block, target.item]);
  const clearDrag = () => {
    dragged.current = undefined;
    setDragging(undefined);
    setOver(undefined);
  };
  useEffect(() => {
    if (disabled) clearDrag();
  }, [disabled]);
  useLayoutEffect(() => {
    const key = moved.current;
    moved.current = undefined;
    if (!key) return;
    const handle = handles.current.get(key);
    handle?.focus({ preventScroll: true });
    handle?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [items]);
  const move = (source: OrderListTarget, target: OrderListTarget, after: boolean) => {
    if (disabled) return;
    const ids = moveOrderList(blocks, source, target, after);
    if (!ids) return;
    const block = blocks.find((block) => block.key === source.block)!;
    const item = block.items.find((item) => item.id === source.item) ?? block.items[0];
    const message =
      source.item === undefined && block.group
        ? t('settings.settingsOrderDialog.groupMoved', {
            title: block.group,
            count: block.items.length,
          })
        : t('settings.settingsOrderDialog.moved', {
            title: item.title,
            value: ids.indexOf(item.id) + 1,
          });
    moved.current = keyOf(source);
    onChange(ids, message);
  };
  const siblings = (target: OrderListTarget): OrderListTarget[] =>
    target.item === undefined
      ? blocks.map((block) => ({ block: block.key }))
      : (blocks.find((block) => block.key === target.block)?.items ?? []).map((item) => ({
          block: target.block,
          item: item.id,
        }));
  const step = (target: OrderListTarget, direction: number) => {
    const rows = siblings(target),
      index = rows.findIndex((row) => keyOf(row) === keyOf(target));
    const next = rows[index + direction];
    if (next) move(target, next, direction > 0);
  };
  const dragStart = (event: DragEvent, target: OrderListTarget) => {
    const button = (event.target as HTMLElement).closest('button');
    if (disabled || (button && !button.classList.contains('shortcut-order-handle'))) {
      event.preventDefault();
      return;
    }
    dragged.current = target;
    setDragging(target);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', keyOf(target));
    handles.current.get(keyOf(target))?.focus({ preventScroll: true });
  };
  const dropTarget = (
    event: DragEvent,
  ): { target: OrderListTarget; after: boolean } | undefined => {
    const source = dragged.current;
    if (disabled || !source) return;
    const hit = event.target as HTMLElement;
    const blockElement = hit.closest<HTMLElement>('[data-order-block]');
    if (!blockElement || !event.currentTarget.contains(blockElement)) return;
    const block = blockElement.dataset.orderBlock!;
    if (source.item !== undefined) {
      const row = hit.closest<HTMLElement>('[data-order-id]');
      if (block !== source.block || !row) return;
      const rect = row.getBoundingClientRect();
      return {
        target: { block, item: row.dataset.orderId! },
        after: event.clientY >= rect.top + rect.height / 2,
      };
    }
    const rect = blockElement.getBoundingClientRect();
    return { target: { block }, after: event.clientY >= rect.top + rect.height / 2 };
  };
  const dropProps = (target: OrderListTarget) => ({
    'data-drop-position':
      over && keyOf(over.target) === keyOf(target) ? (over.after ? 'after' : 'before') : undefined,
    'data-dragging': (dragging && keyOf(dragging) === keyOf(target)) || undefined,
  });
  const handle = (target: OrderListTarget, title: string, testId: string, first: boolean) => (
    <button
      type="button"
      className="shortcut-order-handle"
      draggable={!disabled}
      disabled={disabled}
      ref={(element) => {
        if (element) handles.current.set(keyOf(target), element);
        else handles.current.delete(keyOf(target));
      }}
      data-testid={testId}
      data-initial-focus={first || undefined}
      aria-label={t('settings.settingsOrderDialog.drag', { title })}
      aria-keyshortcuts="ArrowUp ArrowDown"
      title={t('settings.settingsOrderDialog.dragHint')}
      onKeyDown={(event) => {
        if (
          event.nativeEvent.isComposing ||
          event.keyCode === 229 ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey
        )
          return;
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          event.stopPropagation();
          step(target, event.key === 'ArrowUp' ? -1 : 1);
        }
      }}
    >
      ⠿
    </button>
  );
  const arrows = (target: OrderListTarget, title: string, index: number, count: number) => (
    <span className="shortcut-order-moves">
      {([-1, 1] as const).map((direction) => (
        <button
          key={direction}
          type="button"
          className={`settings-list-icon order-move-${direction < 0 ? 'up' : 'down'}`}
          disabled={disabled || (direction < 0 ? index === 0 : index === count - 1)}
          aria-label={t(
            direction < 0 ? 'settings.settingsOrderDialog.up' : 'settings.settingsOrderDialog.down',
            { title },
          )}
          title={t(
            direction < 0 ? 'settings.settingsOrderDialog.up' : 'settings.settingsOrderDialog.down',
            { title },
          )}
          onClick={() => step(target, direction)}
        >
          <Icon name="arrow" />
        </button>
      ))}
    </span>
  );
  let number = 0;
  const allCollapsed = blocks
    .filter((block) => block.group)
    .every((block) => collapsed.has(block.key));
  return (
    <>
      {blocks.some((block) => block.group) && (
        <div className="settings-order-toolbar">
          <span>{t('settings.settingsOrderDialog.itemCount', { count: items.length })}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              setCollapsed(
                allCollapsed
                  ? new Set()
                  : new Set(blocks.filter((block) => block.group).map((block) => block.key)),
              )
            }
          >
            {t(
              allCollapsed
                ? 'settings.settingsOrderDialog.expandAll'
                : 'settings.settingsOrderDialog.collapseAll',
            )}
          </button>
        </div>
      )}
      <ol
        className="shortcut-order-list"
        aria-label={label}
        onDragEnd={clearDrag}
        onDragOver={(event) => {
          const target = dropTarget(event);
          if (
            target &&
            dragged.current &&
            moveOrderList(blocks, dragged.current, target.target, target.after)
          ) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setOver(target);
          } else {
            event.dataTransfer.dropEffect = 'none';
            setOver(undefined);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(undefined);
        }}
        onDrop={(event) => {
          event.preventDefault();
          const target = dropTarget(event),
            source = dragged.current;
          clearDrag();
          if (source && target) move(source, target.target, target.after);
        }}
        onKeyDown={(event) => {
          if (
            event.key === 'Escape' &&
            dragged.current &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229
          ) {
            event.preventDefault();
            event.stopPropagation();
            clearDrag();
          }
        }}
      >
        {blocks.map((block, blockIndex) => {
          const target = { block: block.key };
          const firstNumber = number + 1;
          const children = block.items.map((item, index) => {
            const position = ++number;
            const itemTarget = block.group ? { block: block.key, item: item.id } : target;
            return (
              <li
                key={block.group ? item.id : block.key}
                data-order-id={item.id}
                data-order-block={!block.group ? block.key : undefined}
                className="shortcut-order-row"
                {...dropProps(itemTarget)}
                draggable={!disabled}
                onDragStart={(event) => dragStart(event, itemTarget)}
              >
                {handle(
                  itemTarget,
                  item.title,
                  `settings-order-handle:${item.id}`,
                  blockIndex === 0 && !block.group,
                )}
                <span className="shortcut-order-number">{position}</span>
                <div className="shortcut-order-command">
                  <strong title={item.title}>{item.displayTitle ?? item.title}</strong>
                  {item.description && <small title={item.description}>{item.description}</small>}
                  {item.state && <small className="shortcut-order-state">{item.state}</small>}
                </div>
                {arrows(
                  itemTarget,
                  item.title,
                  block.group ? index : blockIndex,
                  block.group ? block.items.length : blocks.length,
                )}
              </li>
            );
          });
          if (!block.group) return children[0];
          const title = t('settings.settingsOrderDialog.groupTitle', { title: block.group });
          return (
            <li
              key={block.key}
              className="settings-order-group"
              data-order-block={block.key}
              data-order-group={block.group}
              {...dropProps(target)}
            >
              <div
                className="shortcut-order-row settings-order-group-heading"
                draggable={!disabled}
                onDragStart={(event) => dragStart(event, target)}
              >
                {handle(
                  target,
                  title,
                  `settings-order-group-handle:${block.group}`,
                  blockIndex === 0,
                )}
                <button
                  type="button"
                  className="settings-order-group-toggle"
                  disabled={disabled}
                  aria-expanded={!collapsed.has(block.key)}
                  aria-controls={`${id}-${blockIndex}`}
                  onClick={() =>
                    setCollapsed((current) => {
                      const next = new Set(current);
                      if (next.has(block.key)) next.delete(block.key);
                      else next.add(block.key);
                      return next;
                    })
                  }
                >
                  <Icon name="chevron" />
                  <strong title={block.group}>{block.group}</strong>
                </button>
                <span className="settings-order-group-count">
                  {t('settings.settingsOrderDialog.groupCount', {
                    count: block.items.length,
                    start: firstNumber,
                    end: number,
                  })}
                </span>
                {arrows(target, title, blockIndex, blocks.length)}
              </div>
              <ol
                id={`${id}-${blockIndex}`}
                className="settings-order-children"
                hidden={collapsed.has(block.key)}
                aria-label={block.group}
              >
                {children}
              </ol>
            </li>
          );
        })}
      </ol>
    </>
  );
}
