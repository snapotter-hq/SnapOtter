export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? `{${key}}`));
}

export function plural(count: number, one: string, other: string): string {
  return count === 1 ? one : other;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

const TIME_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
};

export function formatDate(date: Date | string | number, locale: string): string {
  const d = new Date(date);
  try {
    return d.toLocaleDateString(locale, DATE_FORMAT_OPTIONS);
  } catch {
    return d.toLocaleDateString("en", DATE_FORMAT_OPTIONS);
  }
}

export function formatDateTime(date: Date | string | number, locale: string): string {
  const d = new Date(date);
  try {
    return `${d.toLocaleDateString(locale, DATE_FORMAT_OPTIONS)} ${d.toLocaleTimeString(locale, TIME_FORMAT_OPTIONS)}`;
  } catch {
    return `${d.toLocaleDateString("en", DATE_FORMAT_OPTIONS)} ${d.toLocaleTimeString("en", TIME_FORMAT_OPTIONS)}`;
  }
}
