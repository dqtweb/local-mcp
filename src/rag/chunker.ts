export function chunkText(text: string, maxChars = 800, overlap = 100): string[] {
  text = text.trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];
  if (overlap < 0 || overlap >= maxChars) throw new Error("0 <= overlap < maxChars required");

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const window = text.slice(start, end);
      const best = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf(" "));
      if (best > maxChars / 2) end = start + best + 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    start = end < text.length ? end - overlap : text.length;
  }
  return chunks;
}