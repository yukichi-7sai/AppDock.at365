import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CommandSettingsNavigation } from './CommandSettingsNavigation';

export type BindingInputFilter = { key: string; label: string; content?: ReactNode };
export type BindingProviderFilter = { id: string | null; title: string };

/** Input discovery replaces remote command/provider targets without saving settings. */
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
  const returnFocus = useRef<{
    trigger: HTMLButtonElement;
    search: HTMLInputElement | null;
  } | null>(null);
  useEffect(() => {
    setFilter('');
    setStatusFilter('all');
    if (provider?.request !== undefined) {
      setInputFilter(null);
      setLocalProvider(null);
    }
  }, [provider?.request]);
  useEffect(() => {
    setFilter('');
    setStatusFilter('all');
    if (target?.request !== undefined) {
      setInputFilter(null);
      setLocalProvider(null);
    }
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
    setLocalProvider(null);
    if (target) navigation?.clear();
    if (provider) clearRemoteProvider?.();
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
  const selectProvider = (next: BindingProviderFilter, trigger: HTMLButtonElement) => {
    returnFocus.current = {
      trigger,
      search:
        trigger
          .closest('.command-shortcuts')
          ?.querySelector<HTMLInputElement>('input[type="search"]') ?? null,
    };
    setFilter('');
    setStatusFilter('all');
    setInputFilter(null);
    setLocalProvider(next);
    if (target) navigation?.clear();
    if (provider) clearRemoteProvider?.();
  };
  const clearProvider = () => {
    setLocalProvider(null);
    if (provider) clearRemoteProvider?.();
    const previous = returnFocus.current;
    returnFocus.current = null;
    (previous?.trigger.isConnected ? previous.trigger : previous?.search)?.focus({
      preventScroll: true,
    });
  };
  return {
    provider: localProvider ?? provider,
    selectProvider,
    clearProvider,
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
