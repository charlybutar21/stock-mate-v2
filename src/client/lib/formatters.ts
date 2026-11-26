/**
 * Stockbit-standard financial number formatting:
 * - Thousands separator: comma (,)
 * - Decimal separator: dot (.)
 * - Rupiah prefix: "Rp " (e.g., "Rp 4,825", "Rp 4,825.67", "-Rp 947,500")
 */

const STOCKBIT_LOCALE = 'en-US';

export function formatIdr(value: number | null | undefined, showDecimals = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat(STOCKBIT_LOCALE, {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(abs);
  return `${value < 0 ? '-' : ''}Rp\u00A0${formatted}`;
}

export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return new Intl.NumberFormat(STOCKBIT_LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, withSign = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  const sign = withSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatMultiple(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${value.toFixed(2)}x`;
}

export function formatShortDate(iso: string, lang: 'en' | 'id'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Parses user-typed or pasted price strings (Stockbit "4,825.67", Indonesian "4.825,67",
 * comma-decimal "4825,67", or plain "4825.67") into canonical numeric string ("4825.67").
 * Preserves a trailing decimal point ("4825.") during live typing when allowDecimals is true.
 */
export function parseStockbitPriceInput(raw: string, allowDecimals: boolean): string {
  const cleaned = raw.replace(/[^0-9.,]/g, '');
  if (!cleaned) return '';

  if (!allowDecimals) {
    // Strip fractional suffix if user pasted a decimal like "4,825.67" or "4.825,67"
    const normalizedForInt = normalizeDecimalSeparator(cleaned);
    const [intPart = ''] = normalizedForInt.split('.');
    return stripLeadingZeros(intPart.replace(/[^0-9]/g, ''));
  }

  const normalized = normalizeDecimalSeparator(cleaned);
  const dotIdx = normalized.indexOf('.');
  if (dotIdx === -1) {
    return stripLeadingZeros(normalized.replace(/[^0-9]/g, ''));
  }

  const intDigits = stripLeadingZeros(normalized.slice(0, dotIdx).replace(/[^0-9]/g, ''));
  const fracDigits = normalized
    .slice(dotIdx + 1)
    .replace(/[^0-9]/g, '')
    .slice(0, 2);

  return `${intDigits || '0'}.${fracDigits}`;
}

function normalizeDecimalSeparator(cleaned: string): string {
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  // Both dot and comma present: whichever comes LAST is the decimal separator
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      // Indonesian format: "4.825,67" -> "4825.67"
      return `${cleaned.slice(0, lastComma).replace(/[.,]/g, '')}.${cleaned.slice(lastComma + 1)}`;
    }
    // Stockbit / EN format: "4,825.67" -> "4825.67"
    return `${cleaned.slice(0, lastDot).replace(/[.,]/g, '')}.${cleaned.slice(lastDot + 1)}`;
  }

  // Only comma(s) present
  if (lastComma !== -1) {
    const commaCount = (cleaned.match(/,/g) ?? []).length;
    const afterComma = cleaned.slice(lastComma + 1);
    // Single comma followed by 0-2 digits (e.g. "4825," or "4825,67") -> decimal comma
    if (commaCount === 1 && afterComma.length <= 2) {
      return `${cleaned.slice(0, lastComma).replace(/,/g, '')}.${afterComma}`;
    }
    // Otherwise thousands separators (e.g. "4,825" or "1,000,000")
    return cleaned.replace(/,/g, '');
  }

  // Only dot(s) present
  if (lastDot !== -1) {
    const dotCount = (cleaned.match(/\./g) ?? []).length;
    const afterDot = cleaned.slice(lastDot + 1);
    // Multiple dots (e.g. "1.000.000") -> thousands separators
    if (dotCount > 1) {
      return cleaned.replace(/\./g, '');
    }
    // Single dot followed by 0-2 digits -> decimal dot (including mid-typing "4825.")
    if (afterDot.length <= 2) {
      return cleaned;
    }
    // Single dot followed by 3 digits when leading part is 1-3 digits (e.g. "4.825" pasted from id-ID)
    const beforeDot = cleaned.slice(0, lastDot);
    if (afterDot.length === 3 && beforeDot.length >= 1 && beforeDot.length <= 3 && !beforeDot.startsWith('0')) {
      return `${beforeDot}${afterDot}`;
    }
    return cleaned;
  }

  return cleaned;
}

function stripLeadingZeros(digits: string): string {
  if (!digits) return '';
  return digits.replace(/^0+(?=\d)/, '');
}

/**
 * Formats a canonical numeric string ("4825.67", "4825.", "10000") into live Stockbit
 * display format ("4,825.67", "4,825.", "10,000").
 */
export function formatStockbitPriceInput(canonical: string, allowDecimals: boolean): string {
  if (!canonical) return '';
  const cleaned = canonical.replace(/[^0-9.]/g, '');
  if (!cleaned) return '';

  const dotIdx = cleaned.indexOf('.');
  if (!allowDecimals || dotIdx === -1) {
    const intDigits = stripLeadingZeros(cleaned.replace(/\./g, ''));
    if (!intDigits) return '';
    return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  const intDigits = stripLeadingZeros(cleaned.slice(0, dotIdx)) || '0';
  const fracDigits = cleaned.slice(dotIdx + 1).replace(/\./g, '').slice(0, 2);
  const formattedInt = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${formattedInt}.${fracDigits}`;
}
