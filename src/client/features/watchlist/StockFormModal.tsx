import { Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  createWatchlistSchema,
  type CreateWatchlistRequest,
  type UpdateWatchlistRequest,
  type WatchlistItemDto,
} from '@/shared/contracts';
import {
  DEFAULT_DISCOUNT_RATE_PCT,
  DEFAULT_PROJECTION_YEARS,
  DEFAULT_TERMINAL_GROWTH_PCT,
  IDX_SECTORS,
  type IdxSector,
} from '@/shared/domain';
import {
  Button,
  cn,
  Field,
  IdxPriceInput,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import { ApiClientError } from '@/client/lib/apiClient';
import {
  HoldingTranchesEditor,
  type EditableHoldingRow,
} from './HoldingTranchesEditor';
import {
  useCreateWatchlistItem,
  useFetchIdxQuote,
  useUpdateWatchlistItem,
} from './useWatchlist';

function parseOptionalInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function parseOptionalFloat(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN;
}

interface StockFormModalProps {
  open: boolean;
  onClose: () => void;
  editingItem?: WatchlistItemDto | null;
}

export function StockFormModal({ open, onClose, editingItem }: StockFormModalProps) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingItem ? t.watchlist.form.editTitle : t.watchlist.form.addTitle}
    >
      {open && (
        <StockFormBody
          key={editingItem?.id ?? 'new'}
          onClose={onClose}
          editingItem={editingItem}
        />
      )}
    </Modal>
  );
}

function StockFormBody({
  onClose,
  editingItem,
}: {
  onClose: () => void;
  editingItem?: WatchlistItemDto | null;
}) {
  const { t } = useI18n();
  const createMutation = useCreateWatchlistItem();
  const updateMutation = useUpdateWatchlistItem();
  const fetchQuoteMutation = useFetchIdxQuote();

  const f0 = editingItem?.fundamentals;

  const [tab, setTab] = useState<'basic' | 'fundamentals'>('basic');
  const [ticker, setTicker] = useState(editingItem?.ticker ?? '');
  const [companyName, setCompanyName] = useState(editingItem?.companyName ?? '');
  const [sector, setSector] = useState<IdxSector>(editingItem?.sector ?? 'FINANCIALS');
  const [currentPrice, setCurrentPrice] = useState(
    editingItem ? String(editingItem.currentPrice) : '',
  );
  const [holdingRows, setHoldingRows] = useState<EditableHoldingRow[]>(() =>
    (editingItem?.holdingTranches ?? []).map((tr, i) => ({
      id: `init_${i}`,
      lots: String(tr.lots),
      buyPrice: String(tr.buyPrice),
    })),
  );
  const [targetBuyPrice, setTargetBuyPrice] = useState(
    editingItem?.targetBuyPrice !== null && editingItem?.targetBuyPrice !== undefined
      ? String(editingItem.targetBuyPrice)
      : '',
  );
  const [investmentThesis, setInvestmentThesis] = useState(
    editingItem?.investmentThesis ?? '',
  );

  // Only 6 Essential Industry-Standard Key Stats + 3 Valuation Benchmarks
  const [periodLabel, setPeriodLabel] = useState(f0?.periodLabel ?? 'TTM');
  const [eps, setEps] = useState(f0?.eps !== null && f0?.eps !== undefined ? String(f0.eps) : '');
  const [bvps, setBvps] = useState(
    f0?.bvps !== null && f0?.bvps !== undefined ? String(f0.bvps) : '',
  );
  const [dps, setDps] = useState(f0?.dps !== null && f0?.dps !== undefined ? String(f0.dps) : '');
  const [roePct, setRoePct] = useState(
    f0?.roePct !== null && f0?.roePct !== undefined ? String(f0.roePct) : '',
  );
  const [der, setDer] = useState(f0?.der !== null && f0?.der !== undefined ? String(f0.der) : '');
  const [epsGrowthPct, setEpsGrowthPct] = useState(
    f0?.epsGrowthPct !== null && f0?.epsGrowthPct !== undefined ? String(f0.epsGrowthPct) : '',
  );
  const [targetPer, setTargetPer] = useState(
    f0?.targetPer !== null && f0?.targetPer !== undefined ? String(f0.targetPer) : '',
  );
  const [targetPbv, setTargetPbv] = useState(
    f0?.targetPbv !== null && f0?.targetPbv !== undefined ? String(f0.targetPbv) : '',
  );
  const [discountRatePct, setDiscountRatePct] = useState(
    String(f0?.discountRatePct ?? DEFAULT_DISCOUNT_RATE_PCT),
  );

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [autoFillNotice, setAutoFillNotice] = useState<string | null>(null);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const handleAutoFill = async () => {
    setFormError(null);
    setAutoFillNotice(null);
    const clean = ticker.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(clean)) {
      setFieldErrors((prev) => ({
        ...prev,
        ticker: 'Must be a 4-letter IDX ticker (e.g. BBCA)',
      }));
      return;
    }

    try {
      const quote = await fetchQuoteMutation.mutateAsync(clean);
      setTicker(quote.ticker);
      setCompanyName(quote.companyName);
      setSector(quote.sector);
      setCurrentPrice(String(quote.currentPrice));
      setPeriodLabel(quote.periodLabel);
      setEps(quote.fundamentals.eps !== null ? String(quote.fundamentals.eps) : '');
      setBvps(quote.fundamentals.bvps !== null ? String(quote.fundamentals.bvps) : '');
      setDps(quote.fundamentals.dps !== null ? String(quote.fundamentals.dps) : '');
      setRoePct(quote.fundamentals.roePct !== null ? String(quote.fundamentals.roePct) : '');
      setDer(quote.fundamentals.der !== null ? String(quote.fundamentals.der) : '');
      setEpsGrowthPct(
        quote.fundamentals.epsGrowthPct !== null ? String(quote.fundamentals.epsGrowthPct) : '',
      );
      setTargetPer(String(quote.fundamentals.targetPer));
      setTargetPbv(String(quote.fundamentals.targetPbv));
      setFieldErrors({});
      setAutoFillNotice(t.watchlist.autoFillSuccess);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
      } else {
        setFormError(t.common.unexpectedError);
      }
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);

    const validHoldingTranches = holdingRows
      .map((r) => ({
        lots: r.lots.trim() ? Math.round(Number(r.lots)) : 0,
        buyPrice: r.buyPrice.trim() ? Math.round(Number(r.buyPrice)) : 0,
      }))
      .filter((r) => r.lots >= 1 && r.buyPrice >= 1);

    const payloadCandidate = {
      ticker: ticker.trim().toUpperCase(),
      companyName: companyName.trim(),
      sector,
      currentPrice: Number(currentPrice),
      holdingTranches: validHoldingTranches,
      targetBuyPrice: parseOptionalInt(targetBuyPrice),
      investmentThesis: investmentThesis.trim() || null,
      fundamentals: {
        periodLabel: periodLabel.trim() || null,
        eps: parseOptionalInt(eps),
        bvps: parseOptionalInt(bvps),
        dps: parseOptionalInt(dps),
        roePct: parseOptionalFloat(roePct),
        der: sector === 'FINANCIALS' ? null : parseOptionalFloat(der),
        epsGrowthPct: parseOptionalFloat(epsGrowthPct),
        targetPer: parseOptionalFloat(targetPer),
        targetPbv: parseOptionalFloat(targetPbv),
        discountRatePct: discountRatePct.trim()
          ? Number(discountRatePct)
          : DEFAULT_DISCOUNT_RATE_PCT,
        projectionYears: f0?.projectionYears ?? DEFAULT_PROJECTION_YEARS,
        terminalGrowthPct: f0?.terminalGrowthPct ?? DEFAULT_TERMINAL_GROWTH_PCT,
        dividendGrowthPct: null,
      },
    };

    const parsed = createWatchlistSchema.safeParse(payloadCandidate);
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error);
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(flat.fieldErrors)) {
        if (v?.[0]) next[k] = v[0];
      }
      setFieldErrors(next);
      if (
        next.ticker ||
        next.companyName ||
        next.currentPrice ||
        next.ownedLots ||
        next.avgBuyPrice ||
        next.targetBuyPrice
      ) {
        setTab('basic');
      } else {
        setTab('fundamentals');
      }
      return;
    }

    try {
      if (editingItem) {
        await updateMutation.mutateAsync({
          id: editingItem.id,
          payload: parsed.data as UpdateWatchlistRequest,
        });
      } else {
        await createMutation.mutateAsync(parsed.data as CreateWatchlistRequest);
      }
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError) {
        setFormError(err.message);
      } else {
        setFormError(t.common.unexpectedError);
      }
    }
  };

  return (
    <>
      <div className="mb-4 flex border-b border-border">
        <button
          type="button"
          onClick={() => setTab('basic')}
          className={cn(
            'border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer',
            tab === 'basic'
              ? 'border-brand-700 text-ink'
              : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.watchlist.form.tabBasic}
        </button>
        <button
          type="button"
          onClick={() => setTab('fundamentals')}
          className={cn(
            'border-b-2 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer',
            tab === 'fundamentals'
              ? 'border-brand-700 text-ink'
              : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {t.watchlist.form.tabFundamentals}
        </button>
      </div>

      {formError && (
        <div
          role="alert"
          className="mb-4 rounded-sm border border-negative-600/25 bg-negative-50 px-3 py-2 text-xs text-negative-700"
        >
          {formError}
        </div>
      )}

      {autoFillNotice && (
        <div
          role="status"
          className="mb-4 rounded-sm border border-positive-600/25 bg-positive-50 px-3 py-2 text-xs text-positive-700"
        >
          {autoFillNotice}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {tab === 'basic' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t.watchlist.form.ticker} htmlFor="stock-ticker" error={fieldErrors.ticker}>
                <div className="flex gap-2">
                  <Input
                    id="stock-ticker"
                    placeholder={t.watchlist.form.tickerPlaceholder}
                    maxLength={4}
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    className="font-mono uppercase"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleAutoFill}
                    disabled={fetchQuoteMutation.isPending || ticker.trim().length < 4}
                    className="h-9 shrink-0"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-brand-700" />
                    {fetchQuoteMutation.isPending
                      ? t.watchlist.autoFilling
                      : t.watchlist.autoFillBtn}
                  </Button>
                </div>
              </Field>

              <Field label={t.watchlist.form.sector} htmlFor="stock-sector">
                <Select
                  id="stock-sector"
                  value={sector}
                  onChange={(e) => setSector(e.target.value as IdxSector)}
                >
                  {IDX_SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {t.sectors[s]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label={t.watchlist.form.companyName}
              htmlFor="stock-company"
              error={fieldErrors.companyName}
            >
              <Input
                id="stock-company"
                placeholder={t.watchlist.form.companyPlaceholder}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={t.watchlist.form.currentPrice}
                htmlFor="stock-price"
                error={fieldErrors.currentPrice}
              >
                <IdxPriceInput
                  id="stock-price"
                  placeholder="5800"
                  value={currentPrice}
                  onValueChange={setCurrentPrice}
                  showTickHint
                  tickHintLabel={t.common.tickStepLabel}
                  stepDownLabel={t.common.stepDown}
                  stepUpLabel={t.common.stepUp}
                />
              </Field>

              <Field
                label={t.watchlist.form.targetBuyPrice}
                htmlFor="stock-target-buy"
                error={fieldErrors.targetBuyPrice}
              >
                <IdxPriceInput
                  id="stock-target-buy"
                  placeholder="5200"
                  value={targetBuyPrice}
                  onValueChange={setTargetBuyPrice}
                  showTickHint
                  tickHintLabel={t.common.tickStepLabel}
                  stepDownLabel={t.common.stepDown}
                  stepUpLabel={t.common.stepUp}
                />
              </Field>
            </div>

            {/* Position Holdings & Multi-Tranche Average Down Section */}
            <HoldingTranchesEditor
              rows={holdingRows}
              onChange={setHoldingRows}
              currentPrice={currentPrice.trim() ? Number(currentPrice) : 0}
            />

            <Field label={t.watchlist.form.investmentThesis} htmlFor="stock-thesis">
              <Textarea
                id="stock-thesis"
                rows={3}
                placeholder={t.watchlist.form.thesisPlaceholder}
                value={investmentThesis}
                onChange={(e) => setInvestmentThesis(e.target.value)}
              />
            </Field>
          </div>
        ) : (
          <div className="space-y-5">
            {/* 6 Core Industry-Standard Key Stats */}
            <div>
              <div className="mb-3 text-[11px] font-semibold tracking-wider text-muted uppercase">
                {t.watchlist.form.keyStatsSection}
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                <Field label={t.watchlist.form.eps} tooltip={t.glossary.eps} htmlFor="f-eps">
                  <Input
                    id="f-eps"
                    type="number"
                    step={1}
                    placeholder="483"
                    value={eps}
                    onChange={(e) => setEps(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </Field>
                <Field label={t.watchlist.form.bvps} tooltip={t.glossary.bvps} htmlFor="f-bvps">
                  <Input
                    id="f-bvps"
                    type="number"
                    step={1}
                    placeholder="2307"
                    value={bvps}
                    onChange={(e) => setBvps(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </Field>
                <Field label={t.watchlist.form.roePct} tooltip={t.glossary.roe} htmlFor="f-roe">
                  <Input
                    id="f-roe"
                    type="number"
                    step="0.01"
                    placeholder="21.2"
                    value={roePct}
                    onChange={(e) => setRoePct(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </Field>
                <Field label={t.watchlist.form.der} tooltip={t.glossary.der} htmlFor="f-der">
                  <Input
                    id="f-der"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={sector === 'FINANCIALS' ? 'N/A (Banking)' : '0.60'}
                    disabled={sector === 'FINANCIALS'}
                    value={sector === 'FINANCIALS' ? '' : der}
                    onChange={(e) => setDer(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </Field>
                <Field
                  label={t.watchlist.form.epsGrowthPct}
                  tooltip={t.glossary.epsGrowth}
                  htmlFor="f-eps-growth"
                >
                  <Input
                    id="f-eps-growth"
                    type="number"
                    step="0.01"
                    placeholder="12.0"
                    value={epsGrowthPct}
                    onChange={(e) => setEpsGrowthPct(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </Field>
                <Field label={t.watchlist.form.dps} tooltip={t.glossary.dps} htmlFor="f-dps">
                  <Input
                    id="f-dps"
                    type="number"
                    min={0}
                    step={1}
                    placeholder="336"
                    value={dps}
                    onChange={(e) => setDps(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </Field>
              </div>
            </div>

            {/* 3 Compact Valuation Benchmarks */}
            <div className="border-t border-border pt-4">
              <div className="mb-3 text-[11px] font-semibold tracking-wider text-muted uppercase">
                {t.watchlist.form.benchmarksSection}
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                <Field
                  label={t.watchlist.form.targetPer}
                  tooltip={t.glossary.targetPer}
                  htmlFor="f-tper"
                >
                  <Input
                    id="f-tper"
                    type="number"
                    min="0.1"
                    step="0.1"
                    placeholder="15.0"
                    value={targetPer}
                    onChange={(e) => setTargetPer(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </Field>
                <Field
                  label={t.watchlist.form.targetPbv}
                  tooltip={t.glossary.targetPbv}
                  htmlFor="f-tpbv"
                >
                  <Input
                    id="f-tpbv"
                    type="number"
                    min="0.1"
                    step="0.1"
                    placeholder="2.5"
                    value={targetPbv}
                    onChange={(e) => setTargetPbv(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </Field>
                <Field
                  label={t.watchlist.form.discountRatePct}
                  tooltip={t.glossary.discountRate}
                  htmlFor="f-disc"
                >
                  <Input
                    id="f-disc"
                    type="number"
                    min={1}
                    max={50}
                    step="0.5"
                    value={discountRatePct}
                    onChange={(e) => setDiscountRatePct(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </Field>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t.common.cancel}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t.watchlist.form.saving : t.common.save}
          </Button>
        </div>
      </form>
    </>
  );
}
