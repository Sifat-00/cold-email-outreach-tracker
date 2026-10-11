export const TZ = "Asia/Dhaka";

export function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

export function fmtDate(isoDate) {
  if (!isoDate) return "—";
  // Plain YYYY-MM-DD dates are already Asia/Dhaka calendar dates.
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export function relative(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function fmtTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function fmtWhen(isoDate, hhmm) {
  if (!isoDate) return "—";
  return hhmm ? `${fmtDate(isoDate)}, ${fmtTime(hhmm)}` : fmtDate(isoDate);
}

export function addDaysIso(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + Number(days))).toISOString().slice(0, 10);
}

export function nowDhakaLocal(plusMinutes = 0) {
  // "YYYY-MM-DDTHH:MM" wall-clock in Asia/Dhaka, for <input type="datetime-local">.
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(Date.now() + plusMinutes * 60000)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function todayDhaka() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function fmtShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d) === todayDhaka();
  return new Intl.DateTimeFormat("en-GB", sameDay
    ? { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }
    : { timeZone: TZ, day: "2-digit", month: "short" }).format(d);
}

export function splitEmailReply(rawText) {
  if (!rawText) return { reply: "", quote: "", hasQuote: false };

  // Common patterns indicating quoted text in emails:
  // 1. "On Sun, 11 Oct 2026 at 11:19 ... wrote: ..."
  // 2. "On [date/time], [name] <[email]> wrote: ..."
  // 3. "-----Original Message-----"
  // 4. "From: ... Sent: ... To: ..."
  const patterns = [
    /\s*On\s+[A-Za-z]{3},?\s+[0-9]{1,2}\s+[A-Za-z]{3}\s+[0-9]{4}.*?wrote:[\s\S]*/i,
    /\s*On\s+.*?wrote:[\s\S]*/i,
    /\s*-{2,}\s*Original Message\s*-{2,}[\s\S]*/i,
    /\s*From:\s+.*?\nSent:\s+.*?\nTo:\s+[\s\S]*/i,
    /\s*_{3,}[\s\S]*/i,
  ];

  for (const pat of patterns) {
    const match = rawText.match(pat);
    if (match && match.index !== undefined) {
      const reply = rawText.slice(0, match.index).trim();
      const quote = rawText.slice(match.index).trim();
      if (reply) {
        return { reply, quote, hasQuote: true };
      }
    }
  }

  return { reply: rawText.trim(), quote: "", hasQuote: false };
}

export function cleanHtmlQuotes(rawHtml, isDark = true) {
  if (!rawHtml) return "<p style='color:#94a3b8'>(no content)</p>";

  // 1. Check for standard HTML quote wrappers (Gmail, Outlook, Yahoo, Thunderbird)
  const htmlQuotePatterns = [
    /(<div[^>]*class=["'][^"']*gmail_quote[^"']*["'][^>]*>[\s\S]*)/i,
    /(<blockquote[^>]*class=["'][^"']*gmail_quote[^"']*["'][^>]*>[\s\S]*)/i,
    /(<blockquote[^>]*>[\s\S]*)/i,
    /(<div[^>]*class=["'][^"']*moz-cite-prefix[^"']*["'][^>]*>[\s\S]*)/i,
  ];

  for (const pat of htmlQuotePatterns) {
    const match = rawHtml.match(pat);
    if (match && match.index !== undefined) {
      const mainPart = rawHtml.slice(0, match.index).trim();
      const quotePart = rawHtml.slice(match.index).trim();
      if (mainPart) {
        return `${mainPart}
          <details class="quote-details">
            <summary class="quote-summary">··· Show quoted email</summary>
            <div class="quote-content">${quotePart}</div>
          </details>`;
      }
    }
  }

  // 2. Check for plain-text style "On Sun, 11 Oct ... wrote:" inside HTML
  const textQuotePattern = /(?:<br\s*\/?>|\n|^)\s*(On\s+[A-Za-z]{3},?\s+[0-9]{1,2}\s+[A-Za-z]{3}\s+[0-9]{4}.*?wrote:[\s\S]*|On\s+.*?wrote:[\s\S]*|-{2,}\s*Original Message\s*-{2,}[\s\S]*)/i;
  const textMatch = rawHtml.match(textQuotePattern);
  if (textMatch && textMatch.index !== undefined) {
    const mainPart = rawHtml.slice(0, textMatch.index).trim();
    const quotePart = rawHtml.slice(textMatch.index).trim();
    if (mainPart) {
      return `${mainPart}
        <details class="quote-details">
          <summary class="quote-summary">··· Show quoted email</summary>
          <div class="quote-content">${quotePart}</div>
        </details>`;
    }
  }

  return rawHtml;
}
