function stripHtml(text) {
  return String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCurrentQuestion(query) {
  return /\b(today|tonight|tomorrow|latest|current|currently|now|recent|recently|news|weather|price|stock|market|release|update|this week|this month)\b/i
    .test(String(query || ""));
}

export async function searchWeb(query) {
  const q = String(query || "").trim();

  if (!q) {
    throw new Error("Search query is empty.");
  }

  const url =
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 JARVIS Desktop Assistant"
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(
      `Web search returned HTTP ${response.status}.`
    );
  }

  const html = await response.text();
  const results = [];

  const resultBlocks =
    html.match(
      /result__body[\s\S]*?(?=result__body|<\/article>)/gi
    ) || [];

  for (const block of resultBlocks) {
    const titleMatch = block.match(
      /result__a[^>]*>([\s\S]*?)<\/a>/i
    );

    const snippetMatch = block.match(
      /result__snippet[^>]*>([\s\S]*?)<\/(?:a|div)>/i
    );

    const title = stripHtml(titleMatch?.[1] || "");
    const snippet = stripHtml(snippetMatch?.[1] || "");

    if (title || snippet) {
      results.push({
        title,
        snippet
      });
    }

    if (results.length >= 8) {
      break;
    }
  }

  if (!results.length) {
    throw new Error(
      "No readable web search results were returned."
    );
  }

  return results;
}
