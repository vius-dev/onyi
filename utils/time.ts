const MINUTE = 60;
const HOUR = MINUTE * 60;
const DAY = HOUR * 24;
const WEEK = DAY * 7;

export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < MINUTE) {
    return `${diffInSeconds}s`;
  } else if (diffInSeconds < HOUR) {
    return `${Math.floor(diffInSeconds / MINUTE)}m`;
  } else if (diffInSeconds < DAY) {
    return `${Math.floor(diffInSeconds / HOUR)}h`;
  } else if (diffInSeconds < WEEK) {
    return `${Math.floor(diffInSeconds / DAY)}d`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

export function formatAbsoluteTime(isoString: string): string {
  const date = new Date(isoString);
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const day = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${time} · ${day}`;
}
