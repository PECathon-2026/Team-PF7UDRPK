import { describe, it, expect } from 'vitest';
import { extractTopics } from '../tfidf';
import type { LocalPost } from '../db';

describe('Local TF-IDF Extraction', () => {
  it('extracts salient topics including macbook, hardware, and benchmarks from sample articles', () => {
    const samplePosts: LocalPost[] = [
      {
        id: '1',
        feedId: 'tech-review',
        title: 'MacBook Pro M4 Benchmarks Revealed',
        link: 'https://example.com/1',
        summary: 'New Apple hardware test results show massive CPU gains in benchmarks testing.',
        publishedAt: Date.now(),
        isRead: false,
        isStarred: false,
      },
      {
        id: '2',
        feedId: 'tech-review',
        title: 'M4 MacBook Pro: Best Laptop Hardware of 2024?',
        link: 'https://example.com/2',
        summary: 'We put the new MacBook hardware through intense multi-core benchmarks.',
        publishedAt: Date.now(),
        isRead: false,
        isStarred: false,
      },
      {
        id: '3',
        feedId: 'tech-review',
        title: 'Comparing M4 vs M3 MacBook Hardware and Battery',
        link: 'https://example.com/3',
        summary: 'Detailed hardware architecture comparison and battery benchmarks on the new MacBook.',
        publishedAt: Date.now(),
        isRead: false,
        isStarred: false,
      },
      {
        id: '4',
        feedId: 'tech-review',
        title: 'Thermal Benchmarks of the New Apple MacBook',
        link: 'https://example.com/4',
        summary: 'Hardware thermals, fan noise, and sustained performance benchmarks for MacBook.',
        publishedAt: Date.now(),
        isRead: false,
        isStarred: false,
      },
      {
        id: '5',
        feedId: 'tech-review',
        title: 'MacBook Gaming Benchmarks and GPU Hardware Speed',
        link: 'https://example.com/5',
        summary: 'Gaming benchmarks testing frame rates on the latest MacBook hardware configuration.',
        publishedAt: Date.now(),
        isRead: false,
        isStarred: false,
      },
    ];

    const topics = extractTopics(samplePosts, 5);

    expect(topics).toContain('macbook');
    expect(topics).toContain('hardware');
    expect(topics).toContain('benchmarks');
  });

  it('handles empty post array gracefully without errors', () => {
    const topics = extractTopics([]);
    expect(topics).toEqual([]);
  });
});

