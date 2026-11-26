import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey().notNull(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey().notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const watchlistItems = sqliteTable('watchlist_items', {
  id: text('id').primaryKey().notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  ticker: text('ticker').notNull(),
  companyName: text('company_name').notNull(),
  sector: text('sector').notNull(),
  currentPrice: integer('current_price').notNull(),
  ownedLots: integer('owned_lots').notNull().default(0),
  avgBuyPrice: integer('avg_buy_price'),
  avgBuyPriceX100: integer('avg_buy_price_x100'),
  holdingTranchesJson: text('holding_tranches_json'),
  targetBuyPrice: integer('target_buy_price'),
  investmentThesis: text('investment_thesis'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const stockFundamentals = sqliteTable('stock_fundamentals', {
  id: text('id').primaryKey().notNull(),
  watchlistItemId: text('watchlist_item_id')
    .notNull()
    .unique()
    .references(() => watchlistItems.id),
  periodLabel: text('period_label'),
  eps: integer('eps'),
  bvps: integer('bvps'),
  dps: integer('dps'),
  roeBps: integer('roe_bps'),
  derX100: integer('der_x100'),
  epsGrowthBps: integer('eps_growth_bps'),
  targetPerX100: integer('target_per_x100'),
  targetPbvX100: integer('target_pbv_x100'),
  discountRateBps: integer('discount_rate_bps').notNull().default(1200),
  projectionYears: integer('projection_years').notNull().default(5),
  terminalGrowthBps: integer('terminal_growth_bps').notNull().default(400),
  dividendGrowthBps: integer('dividend_growth_bps'),
  updatedAt: integer('updated_at').notNull(),
});

export const idxStocks = sqliteTable('idx_stocks', {
  ticker: text('ticker').primaryKey().notNull(),
  companyName: text('company_name').notNull(),
  sector: text('sector').notNull(),
  currentPrice: integer('current_price').notNull(),
  periodLabel: text('period_label'),
  eps: integer('eps'),
  bvps: integer('bvps'),
  dps: integer('dps'),
  roeBps: integer('roe_bps'),
  derX100: integer('der_x100'),
  epsGrowthBps: integer('eps_growth_bps'),
  targetPerX100: integer('target_per_x100'),
  targetPbvX100: integer('target_pbv_x100'),
  source: text('source').notNull().default('tradingview'),
  syncedAt: integer('synced_at').notNull(),
});

export const customWatchlists = sqliteTable('custom_watchlists', {
  id: text('id').primaryKey().notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export const customWatchlistStocks = sqliteTable(
  'custom_watchlist_stocks',
  {
    watchlistId: text('watchlist_id')
      .notNull()
      .references(() => customWatchlists.id),
    ticker: text('ticker').notNull(),
    addedAt: integer('added_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.watchlistId, table.ticker] })],
);
