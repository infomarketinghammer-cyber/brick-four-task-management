/**
 * Server-Side HTML Sanitizer Utility
 * Strips dangerous HTML tags (<script>, <iframe>, event attributes like onload/onerror, etc.)
 */

import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'a', 'b', 'i', 'strong', 'em', 'u', 's', 'strike',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'br',
  'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img'
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'name', 'target', 'rel'],
  img: ['src', 'alt', 'title', 'width', 'height'],
  span: ['class', 'style'],
  div: ['class', 'style'],
  p: ['class', 'style'],
  code: ['class'],
};

export function sanitizeRichText(dirtyHtml?: string | null): string {
  if (!dirtyHtml) return '';
  return sanitizeHtml(dirtyHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto', 'data'],
    allowProtocolRelative: false,
    enforceHtmlBoundary: true,
  });
}
