function decodeHtml(text) {
  return String(text || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export async function searchWeb(query) {
  const q = String(query || "").trim();

  if (!q) {
    throw new Error("Web search query is empty.");
  }

  const url =
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 JARVIS Desktop Assistant"
    }
  });

  if (!response.ok) {
    throw new Error(`Web search returned HTTP ${response.status}.`);
  }

  const html = await response.text();

  const results = [];
  const pattern =
    /class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi;

  let match;

  while ((match = pattern.exec(html)) && results.length < 8) {
    const title = decodeHtml(match[1]);
    const snippet = decodeHtml(match[2]);

    if (!title && !snippet) continue;

    results.push({
      title,
      snippet
    });
  }

  if (!results.length) {
    throw new Error("No readable web results were returned.");
  }

  return results;
}

export function looksTimeSensitive(query) {
  return /\b(today|tonight|tomorrow|latest|current|now|recent|news|weather|price|stock|market|release|update|this week|this month)\b/i
    .test(String(query || ""));
}
