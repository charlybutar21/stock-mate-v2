import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Clock,
  Info,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  calculateValuation,
  round2,
  type DerQualityFlag,
  type RoeQualityFlag,
  type ValueTrapRiskLevel,
} from '@/shared/domain';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  RolePill,
  SectionHeader,
  Skeleton,
  TermTooltip,
  type BadgeTone,
} from '@/client/components/ui/primitives';
import { useI18n } from '@/client/i18n/useI18n';
import {
  formatIdr,
  formatMultiple,
  formatPercent,
  formatShortDate,
} from '@/client/lib/formatters';
import { FairValueRangeBar } from './FairValueRangeBar';
import {
  HoldingTranchesEditor,
  type EditableHoldingRow,
} from './HoldingTranchesEditor';
import { StockFormModal } from './StockFormModal';
import { statusTone } from './WatchlistPage';
import { useFetchIdxQuote, useUpdateWatchlistItem, useWatchlistItem } from './useWatchlist';

function roeTone(flag: RoeQualityFlag): BadgeTone {
  if (flag === 'STRONG') return 'positive';
  if (flag === 'MODERATE') return 'warning';
  if (flag === 'WEAK') return 'negative';
  return 'neutral';
}

function derTone(flag: DerQualityFlag): BadgeTone {
  if (flag === 'NOT_APPLICABLE_BANKING') return 'info';
  if (flag === 'HEALTHY') return 'positive';
  if (flag === 'MODERATE') return 'warning';
  if (flag === 'HIGH_LEVERAGE') return 'negative';
  return 'neutral';
}

function shieldTone(level: ValueTrapRiskLevel): BadgeTone {
  if (level === 'CLEAR') return 'positive';
  if (level === 'WATCH') return 'warning';
  return 'negative';
}

export function StockDetailPage() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { data: item, isLoading, isError } = useWatchlistItem(id);
  const updateMutation = useUpdateWatchlistItem();
  const fetchQuoteMutation = useFetchIdxQuote();

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [positionSavedNotice, setPositionSavedNotice] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const [holdingDraft, setHoldingDraft] = useState<EditableHoldingRow[] | null>(null);

  const activeHoldingRows: EditableHoldingRow[] = useMemo(() => {
    if (holdingDraft !== null) return holdingDraft;
    return (item?.holdingTranches ?? []).map((tr, i) => ({
      id: `srv_${i}`,
      lots: String(tr.lots),
      buyPrice: String(tr.buyPrice),
    }));
  }, [holdingDraft, item]);

  const savePosition = async () => {
    if (!item) return;
    setPositionSavedNotice(false);
    const validTranches = activeHoldingRows
      .map((r) => ({
        lots: r.lots.trim() ? Math.round(Number(r.lots)) : 0,
        buyPrice: r.buyPrice.trim() ? round2(Number(r.buyPrice)) : 0,
      }))
      .filter((r) => r.lots >= 1 && r.buyPrice >= 1);

    await updateMutation.mutateAsync({
      id: item.id,
      payload: {
        holdingTranches: validTranches,
      },
    });
    setHoldingDraft(null);
    setPositionSavedNotice(true);
    setTimeout(() => setPositionSavedNotice(false), 3000);
  };

  const handleSyncData = async () => {
    if (!item) return;
    setSyncNotice(null);
    try {
      const quote = await fetchQuoteMutation.mutateAsync(item.ticker);
      await updateMutation.mutateAsync({
        id: item.id,
        payload: {
          currentPrice: quote.currentPrice,
          fundamentals: {
            periodLabel: quote.periodLabel,
            eps: quote.fundamentals.eps,
            bvps: quote.fundamentals.bvps,
            dps: quote.fundamentals.dps,
            roePct: quote.fundamentals.roePct,
            der: quote.fundamentals.der,
            epsGrowthPct: quote.fundamentals.epsGrowthPct,
          },
        },
      });
      setSyncNotice(t.watchlist.syncSuccess);
      setTimeout(() => setSyncNotice(null), 3000);
    } catch {
      // Handled gracefully
    }
  };

  const [draft, setDraft] = useState<{
    targetPer?: string;
    targetPbv?: string;
    discountRatePct?: string;
  }>({});

  const targetPer =
    draft.targetPer ??
    (item?.fundamentals.targetPer !== null && item?.fundamentals.targetPer !== undefined
      ? String(item.fundamentals.targetPer)
      : '');
  const targetPbv =
    draft.targetPbv ??
    (item?.fundamentals.targetPbv !== null && item?.fundamentals.targetPbv !== undefined
      ? String(item.fundamentals.targetPbv)
      : '');
  const discountRatePct =
    draft.discountRatePct ?? (item ? String(item.fundamentals.discountRatePct) : '12');

  const liveValuation = useMemo(() => {
    if (!item) return null;
    const f = item.fundamentals;
    return calculateValuation({
      sector: item.sector,
      currentPrice: item.currentPrice,
      eps: f.eps,
      bvps: f.bvps,
      dps: f.dps,
      roePct: f.roePct,
      der: f.der,
      epsGrowthPct: f.epsGrowthPct,
      targetPer: targetPer.trim() ? Number(targetPer) : null,
      targetPbv: targetPbv.trim() ? Number(targetPbv) : null,
      discountRatePct: discountRatePct.trim() ? Number(discountRatePct) : f.discountRatePct,
      projectionYears: f.projectionYears,
      terminalGrowthPct: f.terminalGrowthPct,
    });
  }, [item, targetPer, targetPbv, discountRatePct]);

  const resetWhatIf = () => {
    setDraft({});
    setSavedNotice(false);
  };

  const saveWhatIf = async () => {
    if (!item) return;
    setSavedNotice(false);
    await updateMutation.mutateAsync({
      id: item.id,
      payload: {
        fundamentals: {
          targetPer: targetPer.trim() ? Number(targetPer) : null,
          targetPbv: targetPbv.trim() ? Number(targetPbv) : null,
          discountRatePct: Number(discountRatePct),
        },
      },
    });
    setDraft({});
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-36 w-full" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !item || !liveValuation) {
    return (
      <Card variant="display" className="p-8 text-center">
        <p className="text-sm text-muted">{t.common.unexpectedError}</p>
        <Link to="/watchlist" className="mt-4 inline-block text-sm font-medium text-brand-700">
          {t.detail.backToWatchlist}
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top breadcrumb & actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/watchlist"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t.detail.backToWatchlist}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {syncNotice && (
            <Badge tone="positive">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              {syncNotice}
            </Badge>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSyncData}
            disabled={fetchQuoteMutation.isPending || updateMutation.isPending}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${fetchQuoteMutation.isPending ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {fetchQuoteMutation.isPending ? t.watchlist.syncingData : t.watchlist.syncDataBtn}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditModalOpen(true)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            {t.detail.editStock}
          </Button>
          <Link
            to={`/simulator?stockId=${item.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-solid px-3.5 text-xs font-semibold text-white shadow-xs transition-all hover:bg-brand-solid-hover"
          >
            <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
            {t.detail.openSimulator}
          </Link>
        </div>
      </div>

      {/* GROUP 1: Valuation Summary & Market Ratios (Display / Read-Only) */}
      <section className="space-y-4 animate-fade-up" aria-label={t.detail.sectionValuation}>
        <SectionHeader
          title={t.detail.sectionValuation}
          subtitle={t.detail.sectionValuationSub}
          role="calculated"
          roleLabel={t.common.calculatedTag}
        />

        <Card variant="display" className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-mono text-2xl font-bold tracking-tight text-ink">
                  {item.ticker}
                </h1>
                <Badge tone="neutral">{t.sectors[item.sector]}</Badge>
                <Badge tone={statusTone(liveValuation.valuationStatus)}>
                  {t.valuationStatus[liveValuation.valuationStatus]}
                </Badge>
                {item.isStale && (
                  <Badge tone="warning">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {t.watchlist.staleBadge}
                  </Badge>
                )}
              </div>
              <p className="mt-1 font-display text-lg text-ink/90">{item.companyName}</p>
              {item.fundamentals.periodLabel && (
                <p className="text-xs text-muted">{item.fundamentals.periodLabel}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={roeTone(liveValuation.qualityFlags.roeFlag)}>
                  {t.qualityFlags.roe[liveValuation.qualityFlags.roeFlag]}
                </Badge>
                <Badge tone={derTone(liveValuation.qualityFlags.derFlag)}>
                  {liveValuation.qualityFlags.derFlag === 'NOT_APPLICABLE_BANKING' && (
                    <Info className="h-3 w-3" aria-hidden="true" />
                  )}
                  {t.qualityFlags.der[liveValuation.qualityFlags.derFlag]}
                </Badge>
                <Badge tone={shieldTone(liveValuation.valueTrapShield.riskLevel)}>
                  {liveValuation.valueTrapShield.riskLevel === 'CLEAR' ? (
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                  )}
                  {t.valueTrapShield.levels[liveValuation.valueTrapShield.riskLevel]}
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-6 sm:text-right">
              <div>
                <div className="text-[11px] font-medium tracking-wide text-muted uppercase">
                  {t.detail.currentPrice}
                </div>
                <div className="font-mono text-xl font-bold text-ink tabular-nums">
                  {formatIdr(item.currentPrice)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium tracking-wide text-muted uppercase">
                  <TermTooltip
                    label={t.detail.marginOfSafety}
                    definition={t.glossary.marginOfSafety}
                  />
                </div>
                <div
                  className={`font-mono text-xl font-bold tabular-nums ${
                    liveValuation.mosPct === null
                      ? 'text-muted'
                      : liveValuation.mosPct >= 30
                        ? 'text-positive-700'
                        : liveValuation.mosPct >= 0
                          ? 'text-warning-700'
                          : 'text-negative-600'
                  }`}
                >
                  {formatPercent(liveValuation.mosPct, true)}
                </div>
              </div>
              {item.targetBuyPrice !== null && (
                <div>
                  <div className="text-[11px] font-medium tracking-wide text-muted uppercase">
                    {t.detail.targetBuy}
                  </div>
                  <div className="font-mono text-xl font-semibold text-brand-700 tabular-nums">
                    {formatIdr(item.targetBuyPrice)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Fair Value Range Bar */}
          <div className="border-t border-border pt-4">
            <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
              <TermTooltip
                label={t.detail.fairValueRange}
                definition={t.glossary.fairValueRange}
              />
            </h3>
            <FairValueRangeBar
              conservative={liveValuation.fairValue.conservative}
              moderate={liveValuation.fairValue.moderate}
              optimistic={liveValuation.fairValue.optimistic}
              currentPrice={item.currentPrice}
            />
          </div>

          {/* IHSG Value Trap Shield */}
          <div
            className={`rounded-xl border p-4 ${
              liveValuation.valueTrapShield.riskLevel === 'CLEAR'
                ? 'border-positive-600/25 bg-positive-50/50'
                : liveValuation.valueTrapShield.riskLevel === 'WATCH'
                  ? 'border-warning-600/25 bg-warning-50/60'
                  : 'border-negative-600/25 bg-negative-50/60'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {liveValuation.valueTrapShield.riskLevel === 'CLEAR' ? (
                  <ShieldCheck className="h-4 w-4 text-positive-600" aria-hidden="true" />
                ) : (
                  <ShieldAlert
                    className={`h-4 w-4 ${
                      liveValuation.valueTrapShield.riskLevel === 'HIGH_RISK'
                        ? 'text-negative-600'
                        : 'text-warning-600'
                    }`}
                    aria-hidden="true"
                  />
                )}
                <span className="text-xs font-bold text-ink">
                  <TermTooltip
                    label={t.valueTrapShield.title}
                    definition={t.glossary.valueTrapShield}
                  />
                </span>
              </div>
              <Badge tone={shieldTone(liveValuation.valueTrapShield.riskLevel)}>
                {t.valueTrapShield.levels[liveValuation.valueTrapShield.riskLevel]}
              </Badge>
            </div>
            {liveValuation.valueTrapShield.warnings.length === 0 ? (
              <p className="mt-1.5 text-xs text-positive-700">{t.valueTrapShield.clearBody}</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-xs text-ink">
                {liveValuation.valueTrapShield.warnings.map((w) => (
                  <li key={w} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                    <span>{t.valueTrapShield.warnings[w]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        {/* Market Ratios Strip (Display-only flat cards) */}
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <Card variant="display" className="p-4">
            <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">
              <TermTooltip label={t.detail.per} definition={t.glossary.currentPer} />
            </div>
            <div className="mt-1.5 font-mono text-xl font-bold text-ink tabular-nums">
              {formatMultiple(liveValuation.ratios.currentPer)}
            </div>
          </Card>
          <Card variant="display" className="p-4">
            <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">
              <TermTooltip label={t.detail.pbv} definition={t.glossary.currentPbv} />
            </div>
            <div className="mt-1.5 font-mono text-xl font-bold text-ink tabular-nums">
              {formatMultiple(liveValuation.ratios.currentPbv)}
            </div>
          </Card>
          <Card variant="display" className="p-4">
            <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">
              <TermTooltip label={t.detail.divYield} definition={t.glossary.dividendYield} />
            </div>
            <div className="mt-1.5 font-mono text-xl font-bold text-ink tabular-nums">
              {formatPercent(liveValuation.ratios.dividendYieldPct)}
            </div>
          </Card>
          <Card variant="display" className="p-4">
            <div className="text-[11px] font-semibold tracking-wide text-muted uppercase">
              <TermTooltip label={t.detail.peg} definition={t.glossary.pegRatio} />
            </div>
            <div className="mt-1.5 font-mono text-xl font-bold text-ink tabular-nums">
              {formatMultiple(liveValuation.ratios.pegRatio)}
            </div>
          </Card>
        </div>
      </section>

      {/* GROUP 2: My Holding Position (Clearly Marked Editable Card) */}
      <section className="space-y-4 animate-fade-up" aria-label={t.detail.sectionPosition}>
        <SectionHeader
          title={t.detail.sectionPosition}
          subtitle={t.detail.sectionPositionSub}
          role="editable"
          roleLabel={t.common.editableTag}
        />

        <Card variant="editable" className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-editable-header px-5 py-3.5">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-sm font-bold text-ink">
                {t.detail.myPositionTitle}
              </h3>
              <RolePill role="editable" label={t.common.editableTag} />
            </div>
            <div className="flex items-center gap-2">
              {positionSavedNotice && (
                <Badge tone="positive">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  {t.detail.positionSaved}
                </Badge>
              )}
              <Button
                size="sm"
                onClick={savePosition}
                disabled={updateMutation.isPending}
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                {t.detail.savePosition}
              </Button>
            </div>
          </div>

          <div className="p-5">
            <HoldingTranchesEditor
              rows={activeHoldingRows}
              onChange={setHoldingDraft}
              currentPrice={item.currentPrice}
            />
          </div>
        </Card>
      </section>

      {/* GROUP 3: Core-3 Valuation Models (Display) + What-If Tuning (Editable) + Thesis (Display) */}
      <section className="space-y-4 animate-fade-up" aria-label={t.detail.sectionCoreMethods}>
        <SectionHeader
          title={t.detail.sectionCoreMethods}
          subtitle={t.detail.sectionCoreMethodsSub}
        />

        {/* Core-3 2026 Fair Value Methods (Display Cards) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {liveValuation.methods.map((m) => {
            const isPrimaryBankPbv =
              item.sector === 'FINANCIALS' && m.method === 'relativePbv';
            const diffPct =
              m.status === 'VALID' && m.fairValue !== null
                ? ((m.fairValue - item.currentPrice) / m.fairValue) * 100
                : null;
            return (
              <Card
                key={m.method}
                variant="display"
                className="flex flex-col justify-between border-t-2 border-t-brand-600/70 p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ink">
                      <TermTooltip
                        label={t.methods[m.method]}
                        definition={t.glossary[m.method]}
                      />
                    </span>
                    {isPrimaryBankPbv ? (
                      <Badge tone="info">{t.detail.primaryBankRef}</Badge>
                    ) : (
                      <RolePill role="calculated" label={t.common.calculatedTag} />
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {t.methodDescriptions[m.method]}
                  </p>
                  {m.status === 'VALID' ? (
                    <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                      <span className="font-mono text-xl font-bold text-ink tabular-nums">
                        {formatIdr(m.fairValue)}
                      </span>
                      <span
                        className={`font-mono text-xs font-semibold tabular-nums ${
                          (diffPct ?? 0) >= 0 ? 'text-positive-700' : 'text-negative-600'
                        }`}
                      >
                        {formatPercent(diffPct, true)}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-3 border-t border-border pt-3">
                      <span className="font-mono text-base font-semibold text-muted">
                        {t.common.na}
                      </span>
                      {m.reasonCode && (
                        <p className="mt-1 text-xs text-muted">
                          {t.methodReasons[m.reasonCode]}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {/* What-If Tuning (Editable Card) & Investment Thesis (Display Card) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card variant="editable" className="overflow-hidden p-0 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-editable-header px-5 py-3.5">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-sm font-bold text-ink">
                    {t.detail.whatIfTitle}
                  </h3>
                  <RolePill role="editable" label={t.common.editableTag} />
                </div>
                <p className="mt-0.5 text-xs text-muted">{t.detail.whatIfSubtitle}</p>
              </div>
              {savedNotice && (
                <Badge tone="positive">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  {t.detail.savedNotice}
                </Badge>
              )}
            </div>

            <div className="p-5">
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                <Field
                  label={t.watchlist.form.targetPer}
                  tooltip={t.glossary.targetPer}
                  htmlFor="w-tper"
                >
                  <Input
                    id="w-tper"
                    type="number"
                    min="0.1"
                    step="0.5"
                    value={targetPer}
                    onChange={(e) => setDraft((d) => ({ ...d, targetPer: e.target.value }))}
                    className="font-mono tabular-nums"
                  />
                </Field>
                <Field
                  label={t.watchlist.form.targetPbv}
                  tooltip={t.glossary.targetPbv}
                  htmlFor="w-tpbv"
                >
                  <Input
                    id="w-tpbv"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={targetPbv}
                    onChange={(e) => setDraft((d) => ({ ...d, targetPbv: e.target.value }))}
                    className="font-mono tabular-nums"
                  />
                </Field>
                <Field
                  label={t.watchlist.form.discountRatePct}
                  tooltip={t.glossary.discountRate}
                  htmlFor="w-disc"
                >
                  <Input
                    id="w-disc"
                    type="number"
                    min={1}
                    max={50}
                    step="0.5"
                    value={discountRatePct}
                    onChange={(e) => setDraft((d) => ({ ...d, discountRatePct: e.target.value }))}
                    className="font-mono tabular-nums"
                  />
                </Field>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-4">
                <Button variant="secondary" size="sm" onClick={resetWhatIf}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.common.reset}
                </Button>
                <Button size="sm" onClick={saveWhatIf} disabled={updateMutation.isPending}>
                  <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  {updateMutation.isPending
                    ? t.detail.savingAssumptions
                    : t.detail.saveAssumptions}
                </Button>
              </div>
            </div>
          </Card>

          <Card variant="display" className="flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-sm font-bold text-ink">
                    {t.detail.thesisTitle}
                  </h3>
                  <RolePill role="display" label={t.common.displayTag} />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditModalOpen(true)}
                  className="h-7 px-2 text-xs"
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                  {t.common.edit}
                </Button>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                {item.investmentThesis || t.detail.noThesis}
              </p>
            </div>
            <div className="mt-4 border-t border-border pt-3 text-xs text-muted">
              {t.detail.updatedAt}: {formatShortDate(item.updatedAt, lang)}
            </div>
          </Card>
        </div>
      </section>

      <StockFormModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        editingItem={item}
      />
    </div>
  );
}
