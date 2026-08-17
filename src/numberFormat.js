const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

export function formatNumber(value, options = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0';

  const decimals = Number.isInteger(options.decimals)
    ? Math.max(0, Math.min(6, options.decimals))
    : 2;
  const sign = numeric < 0 ? '-' : '';
  const absolute = Math.abs(numeric);

  if (absolute < 1000) {
    const rounded = Number.isInteger(absolute)
      ? String(absolute)
      : absolute.toFixed(decimals).replace(/\.?0+$/, '');
    return `${sign}${rounded}`;
  }

  const group = Math.floor(Math.log10(absolute) / 3);
  if (group >= SUFFIXES.length) {
    return numeric.toExponential(decimals).replace(/\.0+(?=e)/, '');
  }

  const scaled = absolute / (1000 ** group);
  return `${sign}${scaled.toFixed(decimals)}${SUFFIXES[group]}`;
}

export function formatCurrency(value, options = {}) {
  return `$${formatNumber(value, options)}`;
}
