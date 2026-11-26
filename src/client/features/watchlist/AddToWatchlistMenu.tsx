import { Bookmark, BookmarkCheck, Check, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CustomWatchlistGroupDto } from '@/shared/contracts';
import { cn } from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import {
  useAddStockToCustomWatchlist,
  useRemoveStockFromCustomWatchlist,
} from './useWatchlist';

interface AddToWatchlistMenuProps {
  ticker: string;
  memberGroupIds: string[];
  groups: CustomWatchlistGroupDto[];
  onCreateWithTicker: (ticker: string) => void;
}

export function AddToWatchlistMenu({
  ticker,
  memberGroupIds,
  groups,
  onCreateWithTicker,
}: AddToWatchlistMenuProps) {
  const { t } = useI18n();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean } | null>(null);

  const addMutation = useAddStockToCustomWatchlist();
  const removeMutation = useRemoveStockFromCustomWatchlist();
  const isPending = addMutation.isPending || removeMutation.isPending;

  const isInAny = memberGroupIds.length > 0;

  const toggleMenu = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuWidth = 224;
    const left = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.right - menuWidth));
    const openUp = window.innerHeight - rect.bottom < 220 && rect.top > 220;
    setCoords({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left,
      openUp,
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onScroll = () => setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const handleToggleGroup = async (group: CustomWatchlistGroupDto) => {
    const isMember = memberGroupIds.includes(group.id);
    if (isMember) {
      await removeMutation.mutateAsync({ groupId: group.id, ticker });
    } else {
      await addMutation.mutateAsync({ groupId: group.id, payload: { ticker } });
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={isInAny ? `${t.watchlist.inWatchlistsCount} (${memberGroupIds.length})` : t.watchlist.addToWatchlist}
        title={isInAny ? `${t.watchlist.inWatchlistsCount} (${memberGroupIds.length})` : t.watchlist.addToWatchlist}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer',
          isInAny
            ? 'border border-brand-600/35 bg-brand-50 text-brand-700 hover:bg-brand-100'
            : 'text-muted hover:bg-subtle hover:text-ink',
        )}
      >
        {isInAny ? (
          <BookmarkCheck className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>

      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={t.watchlist.addToWatchlist}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: coords.openUp ? 'translateY(-100%)' : 'none',
            }}
            className="z-[90] w-56 overflow-hidden rounded-xl border border-border bg-panel shadow-xl"
          >
            <div className="border-b border-border bg-subtle/60 px-3 py-2">
              <div className="text-[11px] font-bold text-ink">
                {t.watchlist.addToWatchlist}: <span className="font-mono text-brand-700">{ticker}</span>
              </div>
            </div>

            <div className="max-h-52 overflow-y-auto py-1">
              {groups.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted">{t.watchlist.noCustomWatchlistsYet}</p>
              ) : (
                groups.map((group) => {
                  const isMember = memberGroupIds.includes(group.id);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={isMember}
                      disabled={isPending}
                      onClick={() => handleToggleGroup(group)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-ink transition-colors hover:bg-subtle/70 disabled:opacity-50 cursor-pointer"
                    >
                      <span className="truncate font-medium">{group.name}</span>
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                          isMember
                            ? 'border-brand-600 bg-brand-solid text-white'
                            : 'border-input-border bg-input-bg',
                        )}
                      >
                        {isMember && <Check className="h-3 w-3" aria-hidden="true" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-border p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onCreateWithTicker(ticker);
                }}
                className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {t.watchlist.createWithStock} {ticker}
                </span>
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
