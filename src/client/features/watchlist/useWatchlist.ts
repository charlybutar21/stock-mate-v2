import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddCustomWatchlistStockRequest,
  CatalogQuery,
  CatalogResponseDto,
  CatalogSyncResponseDto,
  CreateCustomWatchlistRequest,
  CreateWatchlistRequest,
  CustomWatchlistGroupDto,
  IdxMarketQuoteDto,
  MarketStockDto,
  UpdateCustomWatchlistRequest,
  UpdateWatchlistRequest,
  WatchlistItemDto,
  WatchlistQuery,
} from '@/shared/contracts';
import { apiRequest } from '@/client/lib/apiClient';

function buildCatalogQueryString(query?: Partial<CatalogQuery>): string {
  const params = new URLSearchParams();
  if (query?.search) params.set('search', query.search);
  if (query?.sector) params.set('sector', query.sector);
  if (query?.valuationStatus) params.set('valuationStatus', query.valuationStatus);
  if (query?.minMos !== undefined) params.set('minMos', String(query.minMos));
  if (query?.maxMos !== undefined) params.set('maxMos', String(query.maxMos));
  if (query?.sort) params.set('sort', query.sort);
  if (query?.page !== undefined) params.set('page', String(query.page));
  if (query?.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  return params.toString();
}

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
      const res = await apiRequest<{ item: WatchlistItemDto }>(
        `/api/v1/watchlist/${encodeURIComponent(id!)}`,
      );
      return res.item;
    },
  });
}

export function useIdxCatalog(query?: Partial<CatalogQuery>, enabled = true) {
  const qs = buildCatalogQueryString(query);
  return useQuery<CatalogResponseDto>({
    queryKey: ['watchlist', 'catalog', qs],
    enabled,
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: () => apiRequest<CatalogResponseDto>(`/api/v1/watchlist/catalog${qs ? `?${qs}` : ''}`),
  });
}

export function useIdxCatalogSearch(search: string, enabled = true) {
  const trimmed = search.trim();
  const qs = buildCatalogQueryString({
    search: trimmed || undefined,
    sort: 'ticker_asc',
    page: 1,
    pageSize: 10,
  });

  return useQuery<MarketStockDto[]>({
    queryKey: ['watchlist', 'catalog-search', trimmed],
    enabled: enabled && trimmed.length >= 1,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await apiRequest<CatalogResponseDto>(`/api/v1/watchlist/catalog?${qs}`);
      return res.items;
    },
  });
}

export function useSyncIdxCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<CatalogSyncResponseDto>('/api/v1/watchlist/catalog/sync', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

export function useEnsureWatchlistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ticker: string) => {
      const res = await apiRequest<{ item: WatchlistItemDto }>('/api/v1/watchlist/ensure', {
        method: 'POST',
        body: JSON.stringify({ ticker: ticker.trim().toUpperCase() }),
      });
      return res.item;
    },
    onSuccess: (item) => {
      queryClient.setQueryData(['watchlist', 'detail', item.id], item);
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

export function useCustomWatchlists() {
  return useQuery<CustomWatchlistGroupDto[]>({
    queryKey: ['watchlist', 'groups'],
    queryFn: async () => {
      const res = await apiRequest<{ groups: CustomWatchlistGroupDto[] }>(
        '/api/v1/watchlist/groups',
      );
      return res.groups;
    },
  });
}

export function useCustomWatchlistStocks(
  groupId: string | null,
  query?: Partial<Pick<CatalogQuery, 'search' | 'sector' | 'valuationStatus' | 'minMos' | 'maxMos' | 'sort'>>,
) {
  const qs = buildCatalogQueryString(query);
  return useQuery<{ group: CustomWatchlistGroupDto; items: MarketStockDto[] }>({
    queryKey: ['watchlist', 'group-stocks', groupId, qs],
    enabled: Boolean(groupId),
    placeholderData: keepPreviousData,
    queryFn: () =>
      apiRequest<{ group: CustomWatchlistGroupDto; items: MarketStockDto[] }>(
        `/api/v1/watchlist/groups/${encodeURIComponent(groupId!)}/stocks${qs ? `?${qs}` : ''}`,
      ),
  });
}

export function useCreateCustomWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateCustomWatchlistRequest) => {
      const res = await apiRequest<{ group: CustomWatchlistGroupDto }>('/api/v1/watchlist/groups', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return res.group;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

export function useUpdateCustomWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateCustomWatchlistRequest }) => {
      const res = await apiRequest<{ group: CustomWatchlistGroupDto }>(
        `/api/v1/watchlist/groups/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      );
      return res.group;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

export function useDeleteCustomWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/api/v1/watchlist/groups/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

export function useAddStockToCustomWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      payload,
    }: {
      groupId: string;
      payload: AddCustomWatchlistStockRequest;
    }) => {
      const res = await apiRequest<{ item: MarketStockDto }>(
        `/api/v1/watchlist/groups/${encodeURIComponent(groupId)}/stocks`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      return res.item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

export function useRemoveStockFromCustomWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, ticker }: { groupId: string; ticker: string }) =>
      apiRequest<void>(
        `/api/v1/watchlist/groups/${encodeURIComponent(groupId)}/stocks/${encodeURIComponent(ticker)}`,
        {
          method: 'DELETE',
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
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
      apiRequest<{ item: WatchlistItemDto }>(`/api/v1/watchlist/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['watchlist', 'detail', data.item.id], data.item);
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}

export function useDeleteWatchlistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<void>(`/api/v1/watchlist/${encodeURIComponent(id)}`, {
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

export function useSyncAllWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ updatedCount: number }>('/api/v1/watchlist/sync-all', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });
}
