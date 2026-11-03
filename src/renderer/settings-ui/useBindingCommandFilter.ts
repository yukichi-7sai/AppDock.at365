import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CommandSettingsNavigation } from './CommandSettingsNavigation';

export type BindingInputFilter = { key: string; label: string; content?: ReactNode };
export type BindingProviderFilter = { id: string | null; title: string };

type FilterFocus = { trigger: HTMLButtonElement; search: HTMLInputElement | null };

function filterFocus(trigger: HTMLButtonElement): FilterFocus {
  return {
    trigger,
    search:
      trigger
        .closest('.command-shortcuts')
        ?.querySelector<HTMLInputElement>('input[type="search"]') ?? null,
  };
}

function restoreFilterFocus(previous: FilterFocus | null) {
  (previous?.trigger.isConnected ? previous.trigger : previous?.search)?.focus({
    preventScroll: true,
  });
}

/** Provider, input and command targets combine without changing other filters or saved settings. */
export function useBindingCommandFilter(
  provider?: BindingProviderFilter & { request: number },
  clearRemoteProvider?: () => void,
) {
  const navigation = useContext(CommandSettingsNavigation);
  const target = navigation?.target;
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [inputFilter, setInputFilter] = useState<BindingInputFilter | null>(null);
  const [localProvider, setLocalProvider] = useState<BindingProviderFilter | null>(null);
  const inputFocus = useRef<FilterFocus | null>(null);
  const providerFocus = useRef<FilterFocus | null>(null);
  useEffect(() => {
    if (provider?.request !== undefined) {
      setLocalProvider(null);
      providerFocus.current = null;
      setFilter('');
      setStatusFilter('all');
      setInputFilter(null);
      inputFocus.current = null;
    }
  }, [provider?.request]);
  const selectInput = (input: BindingInputFilter, trigger: HTMLButtonElement) => {
    inputFocus.current = filterFocus(trigger);
    setInputFilter(input);
  };
  const clearInput = () => {
    if (!inputFilter) return;
    setInputFilter(null);
    restoreFilterFocus(inputFocus.current);
    inputFocus.current = null;
  };
  const selectProvider = (next: BindingProviderFilter, trigger: HTMLButtonElement) => {
    providerFocus.current = filterFocus(trigger);
    setLocalProvider(next);
    if (provider) clearRemoteProvider?.();
  };
  const clearProvider = () => {
    setLocalProvider(null);
    if (provider) clearRemoteProvider?.();
    restoreFilterFocus(providerFocus.current);
    providerFocus.current = null;
  };
  return {
    provider: localProvider ?? provider,
    selectProvider,
    clearProvider,
    clearTarget: navigation?.clear,
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
