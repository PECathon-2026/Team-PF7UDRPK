import { describe, it, expect } from 'vitest';
import { inspectSeedListForTraps } from '../trap-detector';

describe('Seed Trap Detector', () => {
  it('detects duplicate canonical blog aliases in seed list', async () => {
    const seedWithTrap = [
      'https://danluu.com/atom.xml',
      'https://simonwillison.net/atom/entries/',
      'https://www.danluu.com/feed/?utm_source=rss', // Duplicate trap!
    ];

    // Mock fetcher that returns valid XML for all
    const mockFetcher = async (url: string) => ({
      status: 200,
      text: '<?xml version="1.0"?><rss><channel><title>Blog</title></channel></rss>',
      finalUrl: url,
    });

    const report = await inspectSeedListForTraps(seedWithTrap, mockFetcher);

    expect(report.trapsFound).toBe(true);
    const trap = report.findings.find((f) => f.type === 'DUPLICATE_CANONICAL');
    expect(trap).toBeDefined();
    expect(trap?.evidence.urlB).toBe('https://www.danluu.com/feed/?utm_source=rss');
    expect(trap?.bountyReportMessage).toContain('danluu.com');
  });

  it('detects malformed/corrupted XML feed trap', async () => {
    const seedWithBrokenXml = [
      'https://simonwillison.net/atom/entries/',
      'https://broken-blog.com/rss.xml',
    ];

    const mockFetcher = async (url: string) => {
      if (url.includes('broken-blog')) {
        return {
          status: 200,
          text: '<html><body>502 Bad Gateway Server Error</body></html>', // HTML trap disguised as feed!
          finalUrl: url,
        };
      }
      return {
        status: 200,
        text: '<?xml version="1.0"?><feed><title>Simon</title></feed>',
        finalUrl: url,
      };
    };

    const report = await inspectSeedListForTraps(seedWithBrokenXml, mockFetcher);

    expect(report.trapsFound).toBe(true);
    const trap = report.findings.find((f) => f.type === 'MALFORMED_XML');
    expect(trap).toBeDefined();
    expect(trap?.bountyReportMessage).toContain('Expected XML feed, but received HTML webpage');
  });

  it('detects identical feed title trap across different domains', async () => {
    const seedWithSameTitle = [
      'https://blog-a.com/rss',
      'https://blog-b.com/atom',
    ];

    const mockFetcher = async (url: string) => ({
      status: 200,
      text: '<?xml version="1.0"?><rss><channel><title>Identical Blog Title</title></channel></rss>',
      finalUrl: url,
    });

    const report = await inspectSeedListForTraps(seedWithSameTitle, mockFetcher);

    expect(report.trapsFound).toBe(true);
    const trap = report.findings.find((f) => f.type === 'IDENTICAL_FEED_TITLE');
    expect(trap).toBeDefined();
    expect(trap?.bountyReportMessage).toContain('Identical Blog Title');
  });
});
