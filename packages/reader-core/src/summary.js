/*
 * Document summaries: the first real paragraph as a unit summary and the
 * first `#` heading as a display name.
 */
import { stripFrontmatter } from './frontmatter.js';

/** First paragraph that is not a heading, checklist, code fence or meta line. */
export function firstParagraph(text) {
  const blocks = stripFrontmatter(text).split(/\r?\n\s*\r?\n/);
  for (const block of blocks) {
    const t = block.trim();
    if (!t || /^#/.test(t) || /^[-*]\s*\[/.test(t) || /^```/.test(t) || /^\*[^*]+\*$/.test(t)) continue;
    return t.replace(/\r?\n/g, ' ').slice(0, 500);
  }
  return null;
}

/** First `# heading` as the display name, else the fallback. */
export function projectName(text, fallback) {
  const h1 = text && text.match(/^#\s+(?!#)(.+?)\s*$/m);
  return h1 ? h1[1] : fallback;
}
