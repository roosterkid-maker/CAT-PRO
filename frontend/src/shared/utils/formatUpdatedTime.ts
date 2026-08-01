export function formatUpdatedTime(timestamp: number): string {
  const elapsedMs = Math.max(0, Date.now() - timestamp);

  if (elapsedMs < 1_000) {
    return "Just now";
  }

  const elapsedSeconds = Math.floor(elapsedMs / 1_000);

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  return `${elapsedHours}h ago`;
}