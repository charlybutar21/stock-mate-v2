import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type {
  AddCustomWatchlistStockRequest,
  CatalogQuery,
  CatalogResponseDto,
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
import {
  queryCatalogSnapshot,
  type CatalogSnapshotResponse,
} from '@/client/lib/catalogOverlay';

function buildCatalogQueryString(query?: Partial<CatalogQuery>): string {
  const params = new URLSearchParams();
  if (query?.search) params.set('search', query.search);
  if (query?.sector) params.set('sector', query.sector);
  if (query?.valuationStatus) params.set('valuationStatus', query.valuationStatus);
  if (query?.minMos !== undefined) params.set('minMos', String(query.minMos));
  if (query?.maxMos !== undefined) params.set('maxMos', String(query.maxMos));
  if (query?.qualityGrade) params.set('qualityGrade', query.qualityGrade);
  if (query?.qarpQuadrant) params.set('qarpQuadrant', query.qarpQuadrant);
  if (query?.minFqs !== undefined) params.set('minFqs', String(query.minFqs));
  if (query?.maxFqs !== undefined) params.set('maxFqs', String(query.maxFqs));
  if (query?.minProfitability !== undefined) {
    params.set('minProfitability', String(query.minProfitability));
  }
  if (query?.minGrowth !== undefined) params.set('minGrowth', String(query.minGrowth));
  if (query?.minHealth !== undefined) params.set('minHealth', String(query.minHealth));
  if (query?.minCashFlow !== undefined) params.set('minCashFlow', String(query.minCashFlow));
  if (query?.minAdtvBillion !== undefined) {
    params.set('minAdtvBillion', String(query.minAdtvBillion));
  }
  if (query?.minPiotroski !== undefined) params.set('minPiotroski', String(query.minPiotroski));
  if (query?.excludeHighRiskTrap !== undefined) {
    params.set('excludeHighRiskTrap', String(query.excludeHighRiskTrap));
  }
  if (query?.sort) params.set('sort', query.sort);
  if (query?.page !== undefined) params.set('page', String(query.page));
  if (query?.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  return params.toString();
}

const AUTO_REFRESH_INTERVAL_MS = 3 * 60 * 1000; // Auto-refresh personal items every 3 minutes when tab is active
const CATALOG_SNAPSHOT_STALE_MS = 2 * 60 * 1000;
const CATALOG_SNAPSHOT_REFRESH_MS = 5 * 60 * 1000; // Matches 5m IDX cron cadence

export function useCatalogSnapshot(enabled = true) {
  return useQuery<CatalogSnapshotResponse>({
    queryKey: ['catalog', 'snapshot'],
    enabled,
    staleTime: CATALOG_SNAPSHOT_STALE_MS,
    refetchInterval: CATALOG_SNAPSHOT_REFRESH_MS,
    refetchIntervalInBackground: false,
    queryFn: () => apiRequest<CatalogSnapshotResponse>('/api/v1/catalog/snapshot'),
  });
}

export function useWatchlist(query?: Partial<WatchlistQuery>) {
  const params = new URLSearchParams();
  if (query?.search) params.set('search', query.search);
  if (query?.sector) params.set('sector', query.sector);
  if (query?.sort) params.set('sort', query.sort);
  const qs = params.toString();

  return useQuery<WatchlistItemDto[]>({
    queryKey: ['watchlist', 'list', qs],
    refetchInterval: AUTO_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
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
    refetchInterval: AUTO_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const res = await apiRequest<{ item: WatchlistItemDto }>(
        `/api/v1/watchlist/${encodeURIComponent(id!)}`,
      );
      return res.item;
    },
  });
}

/**
 * Edge-cached IHSG catalog screener hook: fetches the shared CDN/KV snapshot once
 * (`GET /api/v1/catalog/snapshot`, 0 D1 reads) and overlays the logged-in user's
 * personal holdings & custom watchlist memberships client-side in O(N) (<2ms).
 */
export function useIdxCatalog(query?: Partial<CatalogQuery>, enabled = true) {
  const snapshotQuery = useCatalogSnapshot(enabled);
  const personalQuery = useWatchlist();
  const groupsQuery = useCustomWatchlists();

  const data = useMemo<CatalogResponseDto | undefined>(() => {
    if (!snapshotQuery.data) return undefined;
    return queryCatalogSnapshot(
      snapshotQuery.data,
      personalQuery.data ?? [],
      groupsQuery.data ?? [],
      query,
    );
  }, [snapshotQuery.data, personalQuery.data, groupsQuery.data, query]);

  return {
    data,
    isLoading: snapshotQuery.isLoading,
    isFetching: snapshotQuery.isFetching,
    isError: snapshotQuery.isError,
    refetch: snapshotQuery.refetch,
  };
}

export function useIdxCatalogSearch(search: string, enabled = true) {
  const trimmed = search.trim();
  const snapshotQuery = useCatalogSnapshot(enabled);

  const data = useMemo<MarketStockDto[]>(() => {
    if (!enabled || trimmed.length < 1 || !snapshotQuery.data) return [];
    const res = queryCatalogSnapshot(snapshotQuery.data, [], [], {
      search: trimmed,
      sort: 'ticker_asc',
      page: 1,
      pageSize: 10,
    });
    return res.items;
  }, [enabled, trimmed, snapshotQuery.data]);

  return {
    data,
    isLoading: enabled && trimmed.length >= 1 && snapshotQuery.isLoading,
    isFetching: enabled && trimmed.length >= 1 && snapshotQuery.isFetching,
    isError: snapshotQuery.isError,
  };
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
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'group-stocks'] });
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
  query?: Partial<
    Pick<
      CatalogQuery,
      | 'search'
      | 'sector'
      | 'valuationStatus'
      | 'qualityGrade'
      | 'minFqs'
      | 'minMos'
      | 'maxMos'
      | 'minAdtvBillion'
      | 'excludeHighRiskTrap'
      | 'sort'
    >
  >,
) {
  const qs = buildCatalogQueryString(query);
  return useQuery<{ group: CustomWatchlistGroupDto; items: MarketStockDto[] }>({
    queryKey: ['watchlist', 'group-stocks', groupId, qs],
    enabled: Boolean(groupId),
    refetchInterval: AUTO_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
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
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'groups'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'group-stocks'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'catalog'] });
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
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'groups'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'group-stocks'] });
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
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'groups'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'group-stocks'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'catalog'] });
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
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'groups'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'group-stocks', vars.groupId] });
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'catalog'] });
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
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'groups'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'group-stocks', vars.groupId] });
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'catalog'] });
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
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'group-stocks'] });
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
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'group-stocks'] });
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
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist', 'group-stocks'] });
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
