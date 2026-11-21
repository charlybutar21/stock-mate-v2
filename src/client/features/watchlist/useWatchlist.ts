import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateWatchlistRequest,
  IdxMarketQuoteDto,
  UpdateWatchlistRequest,
  WatchlistItemDto,
  WatchlistQuery,
} from '@/shared/contracts';
import { apiRequest } from '@/client/lib/apiClient';

export function useWatchlist(query?: Partial<WatchlistQuery>) {
  const params = new URLSearchParams();
  if (query?.search) params.set('search', query.search);
  if (query?.sector) params.set('sector', query.sector);
  if (query?.sort) params.set('sort', query.sort);
  const qs = params.toString();

  return useQuery<WatchlistItemDto[]>({
    queryKey: ['watchlist', 'list', qs],
    queryFn: async () => {
      const res = await apiRequest<{ items: WatchlistItemDto[] }>(
        `/api/v1/watchlist${qs ? `?${qs}` : ''}`,
      );
      return res.items;
    },
  });
}

export function useWatchlistItem(id: string | undefined) {
  return useQuery<WatchlistItemDto>({
    queryKey: ['watchlist', 'detail', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await apiRequest<{ item: WatchlistItemDto }>(`/api/v1/watchlist/${id}`);
      return res.item;
    },
  });
}

export function useCreateWatchlistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateWatchlistRequest) =>
      apiRequest<{ item: WatchlistItemDto }>('/api/v1/watchlist', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

export function useUpdateWatchlistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateWatchlistRequest }) =>
      apiRequest<{ item: WatchlistItemDto }>(`/api/v1/watchlist/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['watchlist', 'detail', data.item.id], data.item);
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'list'] });
    },
  });
}

export function useDeleteWatchlistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/api/v1/watchlist/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

export function useFetchIdxQuote() {
  return useMutation({
    mutationFn: async (ticker: string) => {
      const clean = ticker.trim().toUpperCase();
      const res = await apiRequest<{ quote: IdxMarketQuoteDto }>(
        `/api/v1/market-data/idx/${encodeURIComponent(clean)}`,
      );
      return res.quote;
    },
  });
}
