"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateNews = aggregateNews;
const rss_parser_1 = __importDefault(require("rss-parser"));
const prisma_1 = require("../lib/prisma");
const parser = new rss_parser_1.default({
    customFields: {
        item: ['description', 'enclosure'],
    },
});
const RSS_FEEDS = [
    { url: 'https://www.themarker.com/srv/rss', source: 'TheMarker', lang: 'he' },
    { url: 'https://www.calcalist.co.il/srv/rss', source: 'Calcalist', lang: 'he' },
    { url: 'https://www.globes.co.il/webservice/rss/rss_feed.aspx?show=1', source: 'Globes', lang: 'he' },
];
async function aggregateNews() {
    let totalNew = 0;
    for (const feed of RSS_FEEDS) {
        try {
            const result = await parser.parseURL(feed.url);
            for (const item of result.items) {
                if (!item.link)
                    continue;
                try {
                    await prisma_1.prisma.newsArticle.upsert({
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
                }
                catch { /* duplicate URL skip */ }
            }
        }
        catch (err) {
            console.error(`[News] Failed to fetch ${feed.source}:`, err.message);
        }
    }
    console.log(`[News] Aggregated ${totalNew} articles`);
}
