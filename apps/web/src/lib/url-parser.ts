export function isValidHttpUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function extractUrls(input: string): string[] {
  const urls: string[] = [];

  for (const rawLine of input.split("\n")) {
    let line = rawLine.trim();
    if (!line) continue;

    // Strip numbered list prefixes: "1. ", "2) ", "3 "
    line = line.replace(/^\d+[.)]?\s+/, "");
    // Strip bullet prefixes: "- ", "* ", "+ "
    line = line.replace(/^[-*+]\s+/, "");

    // Extract from markdown links: [text](url)
    const mdMatch = line.match(/\[.*?]\((https?:\/\/[^)]+)\)/);
    if (mdMatch) {
      urls.push(mdMatch[1]);
      continue;
    }

    // Extract from HTML img tags: <img src="url">
    const imgMatch = line.match(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/i);
    if (imgMatch) {
      urls.push(imgMatch[1]);
      continue;
    }

    if (isValidHttpUrl(line)) {
      urls.push(line);
    }
  }

  return [...new Set(urls)];
}
