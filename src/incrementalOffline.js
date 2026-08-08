function safeInteger(value, fallback, minimum = 0) {
  return Number.isInteger(value) && value >= minimum ? value : fallback;
}

export function calculateOfflineWindow(lastPlayed, now, settings = {}) {
  const previousTimestamp = Number(lastPlayed);
  const currentTimestamp = Number(now);
  const minimumAwaySeconds = safeInteger(settings.minimumAwaySeconds, 60, 0);
  const capSeconds = safeInteger(settings.capSeconds, 36_000, 1);
  const base = {
    timeAwaySeconds: 0,
    creditedSeconds: 0,
    minimumAwaySeconds,
    capSeconds,
    eligible: false,
    capped: false,
    reason: 'invalid-timestamp',
  };

  if (!Number.isFinite(previousTimestamp) || previousTimestamp < 0
    || !Number.isFinite(currentTimestamp) || currentTimestamp < 0) {
    return base;
  }

  const elapsedMilliseconds = currentTimestamp - previousTimestamp;
  if (elapsedMilliseconds < 0) {
    return { ...base, reason: 'future-timestamp' };
  }

  const timeAwaySeconds = Number.isFinite(elapsedMilliseconds)
    ? Math.floor(elapsedMilliseconds / 1000)
    : Number.MAX_SAFE_INTEGER;
  if (timeAwaySeconds < minimumAwaySeconds) {
    return {
      ...base,
      timeAwaySeconds,
      reason: timeAwaySeconds > 0 ? 'below-minimum' : 'no-time-away',
    };
  }

  return {
    ...base,
    timeAwaySeconds,
    creditedSeconds: Math.min(timeAwaySeconds, capSeconds),
    eligible: true,
    capped: timeAwaySeconds > capSeconds,
    reason: null,
  };
}
