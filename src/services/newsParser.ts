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

export async function aggregateNews() {
  let totalNew = 0;

  for (const feed of RSS_FEEDS) {
    try {
      const result = await parser.parseURL(feed.url);

      for (const item of result.items) {
        if (!item.link) continue;

        try {
          await prisma.newsArticle.upsert({
            where: { url: item.link },
            create: {
              source: feed.source,
              titleHe: feed.lang === 'he' ? item.title : undefined,
              titleEn: feed.lang === 'en' ? item.title : undefined,
              summaryHe: feed.lang === 'he' ? item.contentSnippet?.slice(0, 300) : undefined,
              summaryEn: feed.lang === 'en' ? item.contentSnippet?.slice(0, 300) : undefined,
              url: item.link,
              publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
              lang: feed.lang,
            },
            update: {},
          });
          totalNew++;
        } catch { /* duplicate URL skip */ }
      }
    } catch (err) {
      console.error(`[News] Failed to fetch ${feed.source}:`, (err as Error).message);
    }
  }

  console.log(`[News] Aggregated ${totalNew} articles`);
}
