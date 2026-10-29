/**
 * Seed dataset of 12 well-known independent small-web blogs.
 * Spans diverse categories to power co-subscription clustering and the 10-15% Serendipity Shelf.
 */

export interface SeedBlog {
  title: string;
  originalUrl: string;
  siteUrl: string;
  category: 'systems' | 'web' | 'design' | 'essays' | 'hardware';
  description: string;
}

export const SEED_BLOGS: SeedBlog[] = [
  {
    title: 'Dan Luu',
    originalUrl: 'https://danluu.com/atom.xml',
    siteUrl: 'https://danluu.com',
    category: 'systems',
    description: 'Deep engineering essays on computer architecture, performance, and hardware engineering.',
  },
  {
    title: 'Simon Willison’s Weblog',
    originalUrl: 'https://simonwillison.net/atom/entries/',
    siteUrl: 'https://simonwillison.net',
    category: 'web',
    description: 'Notes on Python, SQLite, Datasette, LLMs, and open-source web tooling.',
  },
  {
    title: 'Robin Sloan',
    originalUrl: 'https://www.robinsloan.com/feed.xml',
    siteUrl: 'https://www.robinsloan.com',
    category: 'essays',
    description: 'Author and media inventor writing on the artisanal internet and creative computing.',
  },
  {
    title: 'Drew DeVault’s Blog',
    originalUrl: 'https://drewdevault.com/blog/index.xml',
    siteUrl: 'https://drewdevault.com',
    category: 'systems',
    description: 'Free software development, Hare language, SourceHut, and systems architecture.',
  },
  {
    title: 'Julia Evans (Bite Size Networking)',
    originalUrl: 'https://jvns.ca/atom.xml',
    siteUrl: 'https://jvns.ca',
    category: 'systems',
    description: 'Delightful engineering zines, Linux debugging, DNS, and networking fundamentals.',
  },
  {
    title: 'Derek Sivers',
    originalUrl: 'https://sive.rs/en.atom',
    siteUrl: 'https://sive.rs',
    category: 'essays',
    description: 'Philosophical short essays on life, independence, programming, and music.',
  },
  {
    title: 'Xe Iaso',
    originalUrl: 'https://xeiaso.net/blog.rss',
    siteUrl: 'https://xeiaso.net',
    category: 'systems',
    description: 'Systems architecture, NixOS, Tailwind, and speculative technology fiction.',
  },
  {
    title: 'Kottke.org (Jason Kottke)',
    originalUrl: 'https://feeds.kottke.org/main',
    siteUrl: 'https://kottke.org',
    category: 'design',
    description: 'One of the oldest blogs on the web, curating art, technology, science, and visual culture.',
  },
  {
    title: 'Brandur Leach',
    originalUrl: 'https://brandur.org/articles.atom',
    siteUrl: 'https://brandur.org',
    category: 'systems',
    description: 'Postgres internals, idempotent APIs, systems design, and minimalist running.',
  },
  {
    title: 'Maggie Appleton',
    originalUrl: 'https://maggieappleton.com/rss.xml',
    siteUrl: 'https://maggieappleton.com',
    category: 'design',
    description: 'Visual essays, digital gardens, tools for thought, and human-computer symbiosis.',
  },
  {
    title: 'Bunnie Studios (Andrew Huang)',
    originalUrl: 'https://www.bunniestudios.com/blog/?feed=rss2',
    siteUrl: 'https://www.bunniestudios.com',
    category: 'hardware',
    description: 'Hardware reverse-engineering, open source hardware, silicon, and electronics manufacturing.',
  },
  {
    title: 'Arun Venkatesan',
    originalUrl: 'https://www.arun.is/feed.xml',
    siteUrl: 'https://www.arun.is',
    category: 'hardware',
    description: 'Industrial design, Apple hardware aesthetics, tactile materials, and craftsmanship.',
  },
];

/**
 * Pre-populated anonymous batches to simulate active reader co-subscriptions
 * Cluster 1 (Systems & Core Engineering): Dan Luu, Simon Willison, Julia Evans, Brandur
 * Cluster 2 (Design & Creative): Robin Sloan, Maggie Appleton, Kottke
 * Cluster 3 (Hardware & Silicon): Bunnie Studios, Arun Venkatesan, Dan Luu
 * Cluster 4 (Indie Web & Philosophy): Derek Sivers, Robin Sloan, Xe Iaso
 */
export const SEED_ANONYMOUS_BATCHES: string[][] = [
  ['https://danluu.com/atom.xml', 'https://simonwillison.net/atom/entries/', 'https://jvns.ca/atom.xml'],
  ['https://danluu.com/atom.xml', 'https://brandur.org/articles.atom', 'https://drewdevault.com/blog/index.xml'],
  ['https://simonwillison.net/atom/entries/', 'https://jvns.ca/atom.xml', 'https://brandur.org/articles.atom'],
  ['https://www.robinsloan.com/feed.xml', 'https://maggieappleton.com/rss.xml', 'https://feeds.kottke.org/main'],
  ['https://www.robinsloan.com/feed.xml', 'https://sive.rs/en.atom', 'https://xeiaso.net/blog.rss'],
  ['https://www.bunniestudios.com/blog/?feed=rss2', 'https://www.arun.is/feed.xml', 'https://danluu.com/atom.xml'],
  ['https://www.bunniestudios.com/blog/?feed=rss2', 'https://www.arun.is/feed.xml'],
  ['https://maggieappleton.com/rss.xml', 'https://feeds.kottke.org/main', 'https://sive.rs/en.atom'],
];
