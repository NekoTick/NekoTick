import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

let registered = false;
const HIGHLIGHT_CACHE_ENTRY_LIMIT = 200;
const HIGHLIGHT_CACHE_CHAR_LIMIT = 2 * 1024 * 1024;
const highlightedCodeCache = new Map<string, { html: string; weight: number }>();
let highlightedCodeCacheChars = 0;

function registerLanguages() {
  if (registered) return;
  registered = true;
  hljs.registerLanguage('bash', bash);
  hljs.registerLanguage('shell', bash);
  hljs.registerLanguage('sh', bash);
  hljs.registerLanguage('c', c);
  hljs.registerLanguage('cpp', cpp);
  hljs.registerLanguage('c++', cpp);
  hljs.registerLanguage('csharp', csharp);
  hljs.registerLanguage('cs', csharp);
  hljs.registerLanguage('css', css);
  hljs.registerLanguage('go', go);
  hljs.registerLanguage('java', java);
  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('js', javascript);
  hljs.registerLanguage('json', json);
  hljs.registerLanguage('markdown', markdown);
  hljs.registerLanguage('md', markdown);
  hljs.registerLanguage('python', python);
  hljs.registerLanguage('py', python);
  hljs.registerLanguage('rust', rust);
  hljs.registerLanguage('rs', rust);
  hljs.registerLanguage('sql', sql);
  hljs.registerLanguage('typescript', typescript);
  hljs.registerLanguage('ts', typescript);
  hljs.registerLanguage('xml', xml);
  hljs.registerLanguage('html', xml);
  hljs.registerLanguage('yaml', yaml);
  hljs.registerLanguage('yml', yaml);
}

registerLanguages();

export const markdownHighlighter = hljs;
export const chatHighlighter = markdownHighlighter;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function rememberHighlightedCode(key: string, html: string): string {
  const weight = key.length + html.length;
  if (weight > HIGHLIGHT_CACHE_CHAR_LIMIT) {
    return html;
  }

  while (
    highlightedCodeCache.size >= HIGHLIGHT_CACHE_ENTRY_LIMIT ||
    highlightedCodeCacheChars + weight > HIGHLIGHT_CACHE_CHAR_LIMIT
  ) {
    const oldestKey = highlightedCodeCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = highlightedCodeCache.get(oldestKey);
    highlightedCodeCache.delete(oldestKey);
    highlightedCodeCacheChars -= oldest?.weight ?? 0;
  }

  highlightedCodeCache.set(key, { html, weight });
  highlightedCodeCacheChars += weight;
  return html;
}

export function highlightMarkdownCode(codeText: string, language: string): string {
  const supportedLanguage = language && markdownHighlighter.getLanguage(language)
    ? language
    : '';
  const mode = language ? `language:${supportedLanguage || 'plain'}` : 'auto';
  const key = `${mode}\u0000${codeText}`;
  const cached = highlightedCodeCache.get(key);
  if (cached !== undefined) {
    highlightedCodeCache.delete(key);
    highlightedCodeCache.set(key, cached);
    return cached.html;
  }

  try {
    const html = supportedLanguage
      ? markdownHighlighter.highlight(codeText, { language: supportedLanguage }).value
      : language
        ? escapeHtml(codeText)
        : markdownHighlighter.highlightAuto(codeText).value;
    return rememberHighlightedCode(key, html);
  } catch {
    return rememberHighlightedCode(key, escapeHtml(codeText));
  }
}
