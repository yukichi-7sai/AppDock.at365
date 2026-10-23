import { useContext, useEffect, useRef, useState } from 'react';
import { CommandSettingsNavigation } from './CommandSettingsNavigation';

export type BindingInputFilter = { key: string; label: string };

/** Input discovery replaces remote command/provider targets without saving settings. */
export function useBindingCommandFilter(providerRequest?: number, clearProvider?: () => void) {
  const navigation = useContext(CommandSettingsNavigation);
  const target = navigation?.target;
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [inputFilter, setInputFilter] = useState<BindingInputFilter | null>(null);
  const returnFocus = useRef<{
    trigger: HTMLButtonElement;
    search: HTMLInputElement | null;
  } | null>(null);
  useEffect(() => {
    setFilter('');
    setStatusFilter('all');
    if (providerRequest !== undefined) setInputFilter(null);
  }, [providerRequest]);
  useEffect(() => {
    setFilter('');
    setStatusFilter('all');
    if (target?.request !== undefined) setInputFilter(null);
  }, [target?.request]);
  const selectInput = (input: BindingInputFilter, trigger: HTMLButtonElement) => {
    returnFocus.current = {
      trigger,
      search:
        trigger
          .closest('.command-shortcuts')
          ?.querySelector<HTMLInputElement>('input[type="search"]') ?? null,
    };
    setFilter('');
    setStatusFilter('all');
    setInputFilter(input);
    if (target) navigation?.clear();
    if (providerRequest !== undefined) clearProvider?.();
  };
  const clearInput = () => {
    if (!inputFilter) return;
    setInputFilter(null);
    const previous = returnFocus.current;
    returnFocus.current = null;
    (previous?.trigger.isConnected ? previous.trigger : previous?.search)?.focus({
      preventScroll: true,
    });
  };
  return {
    target,
    filter,
    setFilter,
    statusFilter,
    setStatusFilter,
    inputFilter,
    selectInput,
    clearInput,
  };
}
