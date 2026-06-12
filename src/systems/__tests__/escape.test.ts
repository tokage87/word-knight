import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeAttr } from '../escape';

describe('escapeHtml', () => {
  it('escapes & < > and leaves quotes alone', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href="x"&gt;&amp;&lt;/a&gt;');
  });

  it('escapes & first so existing entities are not double-decoded', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('passes plain text through unchanged', () => {
    expect(escapeHtml('zażółć gęślą jaźń')).toBe('zażółć gęślą jaźń');
    expect(escapeHtml('')).toBe('');
  });
});

describe('escapeAttr', () => {
  it('escapes & " and <  > for attribute positions', () => {
    expect(escapeAttr('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
  });

  it('handles a value that could break out of a data attribute', () => {
    expect(escapeAttr('" onmouseover="alert(1)')).toBe('&quot; onmouseover=&quot;alert(1)');
  });

  it('passes plain text through unchanged', () => {
    expect(escapeAttr("plain text with 'single quotes'")).toBe("plain text with 'single quotes'");
  });
});
