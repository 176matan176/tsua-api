import Parser from 'rss-parser';
import { prisma } from '../lib/prisma';

const parser = new Parser({
  customFields: {
    item: ['description', 'enclosure'],
  },
});

const RSS_FEEDS = [
  { url: 'https://www.themarker.com/srv/rss', source: 'TheMarker', lang: 'he' },
  { url: 'https://www.calcalist.co.il/srv/rss', source: 'Calcalist', lang: 'he' },
  { url: 'https://www.globes.co.il/webservice/rss/rss_feed.aspx?show=1', source: 'Globes', lang: 'he' },
];

export async function parseAllFeeds(): Promise<number> {
  let totalSaved = 0;

  for (const feed of RSS_FEEDS) {
    try {
      const result = await parser.parseURL(feed.url);
      let feedSaved = 0;

      for (const item of result.items) {
        if (!item.link) continue;

        try {
          await prisma.newsArticle.upsert({
            where: { url: item.link },
            create: {
              source: feed.source,
              titleHe: feed.lang === 'he' ? item.title ?? null : null,
              titleEn: feed.lang === 'en' ? item.title ?? null : null,
              summaryHe: feed.lang === 'he' ? (item.contentSnippet?.slice(0, 300) ?? null) : null,
              summaryEn: feed.lang === 'en' ? (item.contentSnippet?.slice(0, 300) ?? null) : null,
              url: item.link,
              publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
              lang: feed.lang,
            },
            update: {},
          });
          feedSaved++;
        } catch (err) {
          // Skip duplicate or constraint errors silently
          const msg = (err as Error).message ?? '';
          if (!msg.includes('Unique constraint') && !msg.includes('unique')) {
            console.error(`[News] Failed to save article from ${feed.source}:`, msg);
          }
        }
      }

      console.log(`[News] ${feed.source}: saved ${feedSaved} articles`);
      totalSaved += feedSaved;
    } catch (err) {
      console.error(`[News] Failed to fetch ${feed.source}:`, (err as Error).message);
    }
  }

  console.log(`[News] Total articles saved: ${totalSaved}`);
  return totalSaved;
}

// Backward-compat alias
export const aggregateNews = parseAllFeeds;
