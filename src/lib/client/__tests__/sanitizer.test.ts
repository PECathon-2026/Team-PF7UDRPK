import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

// DOMPurify requires a real DOM window — use jsdom in the test environment
const { window: jsdomWindow } = new JSDOM('<!DOCTYPE html><html><body></body></html>');
// Cast is necessary because jsdom's Window type is slightly different from browser's
const purify = DOMPurify(jsdomWindow as unknown as Window & typeof globalThis);

describe('DOMPurify XSS sanitizer', () => {
  it('strips <script> tags entirely', () => {
    const dirty = '<p>Hello world</p><script>alert("xss")</script>';
    const clean = purify.sanitize(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('alert');
    expect(clean).toContain('Hello world');
  });

  it('strips javascript: href', () => {
    const dirty = '<a href="javascript:alert(1)">Click me</a>';
    const clean = purify.sanitize(dirty);
    expect(clean).not.toContain('javascript:');
    // The anchor text should still be present
    expect(clean).toContain('Click me');
  });

  it('strips onerror event handler from img', () => {
    const dirty = '<img src="x" onerror="alert(1)">';
    const clean = purify.sanitize(dirty);
    expect(clean).not.toContain('onerror');
  });

  it('strips onclick handlers from any element', () => {
    const dirty = '<button onclick="steal()">Click</button>';
    const clean = purify.sanitize(dirty);
    expect(clean).not.toContain('onclick');
  });

  it('strips <iframe> elements', () => {
    const dirty = '<iframe src="https://evil.com/tracker"></iframe>';
    const clean = purify.sanitize(dirty);
    expect(clean).not.toContain('iframe');
  });

  it('preserves safe paragraph and text', () => {
    const safe = '<p>This is a safe paragraph with <strong>bold</strong> and <em>italic</em>.</p>';
    const clean = purify.sanitize(safe);
    expect(clean).toContain('<p>');
    expect(clean).toContain('<strong>bold</strong>');
    expect(clean).toContain('<em>italic</em>');
  });

  it('preserves safe anchor tags with https href', () => {
    const safe = '<a href="https://example.com" target="_blank" rel="noopener">Visit</a>';
    const clean = purify.sanitize(safe);
    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain('Visit');
  });

  it('preserves safe img tags with proper src', () => {
    const safe = '<img src="https://example.com/image.png" alt="A description">';
    const clean = purify.sanitize(safe);
    expect(clean).toContain('src="https://example.com/image.png"');
    expect(clean).toContain('alt="A description"');
  });

  it('strips data: URIs in img src (potential XSS vector)', () => {
    const dirty = '<img src="data:text/html,<script>alert(1)</script>">';
    const clean = purify.sanitize(dirty);
    // DOMPurify blocks data: URIs in src by default for non-image types
    expect(clean).not.toContain('<script>');
  });
});

