/**
 * Formats a date value (Date object, string, or number) into a SQL-friendly
 * and human-readable string: YYYY-MM-DD HH:MM:SS[.sss]
 *
 * - Uses a space instead of 'T'.
 * - Only includes time if it's not midnight (unless milliseconds are present).
 * - Only includes milliseconds if they are non-zero.
 */
export function formatSqlDate(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value === "$HAPPYDB_NOW$") return "[NOW]";

  try {
    const d = new Date(value as string | number | Date);
    if (Number.isNaN(d.getTime())) return String(value);

    const pad = (n: number) => String(n).padStart(2, "0");
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = d.getHours();
    const min = d.getMinutes();
    const s = d.getSeconds();
    const ms = d.getMilliseconds();

    const datePart = `${y}-${m}-${day}`;

    // If it's a pure date (no time component and no ms), just return date
    if (h === 0 && min === 0 && s === 0 && ms === 0) {
      // But wait: if the input was an ISO string that explicitly had time, maybe we should keep it?
      // For now, let's follow the "original display" rule.
      // If the string was "2024-01-01", it's a date.
      const valStr = String(value);
      if (valStr.length <= 10 && !valStr.includes(":") && !valStr.includes("T")) {
        return datePart;
      }
    }

    let timePart = `${pad(h)}:${pad(min)}:${pad(s)}`;
    if (ms > 0) {
      timePart += `.${String(ms).padStart(3, "0")}`;
    }

    return `${datePart} ${timePart}`;
  } catch {
    return String(value);
  }
}

/**
 * Checks if a string or metadata indicates a date/time type.
 */
export function isDateTimeValue(value: unknown, dataType?: string): boolean {
  if (dataType) {
    const dt = dataType.toLowerCase();
    return (
      dt.includes("date") ||
      dt.includes("time") ||
      dt.includes("timestamp")
    );
  }

  if (typeof value === "string") {
    // Basic YYYY-MM-DD pattern
    return /^\d{4}-\d{2}-\d{2}/.test(value);
  }

  return value instanceof Date;
}

/**
 * Detects if a default value string represents a database "current time" function.
 */
export function isTimestampDefault(value: string | null | undefined): boolean {
  if (!value) return false;
  const d = value.toLowerCase();
  // Match common SQL defaults for "now"
  return (
    d.includes("current_timestamp") ||
    d.includes("now()") ||
    d.includes("getdate()") ||
    d.includes("current_date") ||
    d.includes("current_time") ||
    d.includes("localtimestamp")
  );
}
