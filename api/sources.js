// Vercel Serverless Function: Manga Sources API
// Zero persistent database required - pure on-demand scraping and API normalization

const SOURCES = [
  {
    id: "mangadex",
    name: "MangaDex",
    lang: "en",
    version: "1.2.0",
    icon: "https://mangadex.org/favicon.ico",
    supports_latest: true,
    is_nsfw: false
  },
  {
    id: "asurascans",
    name: "Asura Scans",
    lang: "en",
    version: "1.6.69",
    icon: "https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/en/asurascans/res/mipmap-xhdpi/ic_launcher.png",
    supports_latest: true,
    is_nsfw: false
  },
  {
    id: "mangapill",
    name: "MangaPill",
    lang: "en",
    version: "1.1.0",
    icon: "https://mangapill.com/favicon.ico",
    supports_latest: true,
    is_nsfw: false
  }
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ---------------------------------------------------------------------------
// MangaDex Scraper / Normalizer
// ---------------------------------------------------------------------------
const MangaDex = {
  API_BASE: 'https://api.mangadex.org',

  getTitle(attrs) {
    const titleMap = attrs.title || {};
    if (titleMap.en) return titleMap.en;
    for (const alt of attrs.altTitles || []) {
      if (alt.en) return alt.en;
    }
    return Object.values(titleMap)[0] || 'Untitled Manga';
  },

  getCover(mangaId, rels) {
    const coverRel = (rels || []).find(r => r.type === 'cover_art');
    const fileName = coverRel?.attributes?.fileName;
    if (fileName) {
      return `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.512.jpg`;
    }
    return '/static/img/default-cover.png';
  },

  formatManga(item) {
    const attrs = item.attributes || {};
    return {
      id: item.id,
      source: 'mangadex',
      title: this.getTitle(attrs),
      cover_url: this.getCover(item.id, item.relationships),
      status: attrs.status ? attrs.status.charAt(0).toUpperCase() + attrs.status.slice(1) : 'Unknown',
      summary: attrs.description?.en || '',
      genres: (attrs.tags || []).map(t => t.attributes?.name?.en).filter(Boolean)
    };
  },

  async getPopular(page = 1) {
    const offset = (page - 1) * 24;
    const url = `${this.API_BASE}/manga?limit=24&offset=${offset}&includes[]=cover_art&order[followedCount]=desc&contentRating[]=safe&contentRating[]=suggestive`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const data = await res.json();
    return {
      manga: (data.data || []).map(item => this.formatManga(item)),
      has_next: (data.offset + data.limit) < (data.total || 0)
    };
  },

  async getLatest(page = 1) {
    const offset = (page - 1) * 24;
    const url = `${this.API_BASE}/manga?limit=24&offset=${offset}&includes[]=cover_art&order[latestUploadedChapter]=desc&contentRating[]=safe&contentRating[]=suggestive`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const data = await res.json();
    return {
      manga: (data.data || []).map(item => this.formatManga(item)),
      has_next: (data.offset + data.limit) < (data.total || 0)
    };
  },

  async search(query, page = 1) {
    const offset = (page - 1) * 24;
    const url = `${this.API_BASE}/manga?title=${encodeURIComponent(query)}&limit=24&offset=${offset}&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const data = await res.json();
    return {
      manga: (data.data || []).map(item => this.formatManga(item)),
      has_next: (data.offset + data.limit) < (data.total || 0)
    };
  },

  async getDetails(id) {
    const url = `${this.API_BASE}/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const data = await res.json();
    if (!data.data) throw new Error('Manga not found');
    const item = data.data;
    const formatted = this.formatManga(item);
    const authorRel = (item.relationships || []).find(r => r.type === 'author');
    const artistRel = (item.relationships || []).find(r => r.type === 'artist');
    formatted.author = authorRel?.attributes?.name || '';
    formatted.artist = artistRel?.attributes?.name || '';
    return formatted;
  },

  async getChapters(id) {
    const url = `${this.API_BASE}/manga/${id}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=500`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const data = await res.json();
    const chapters = (data.data || []).map((ch, idx) => {
      const attrs = ch.attributes || {};
      const num = attrs.chapter ? String(attrs.chapter) : String(idx + 1);
      const title = attrs.title ? `Ch. ${num} - ${attrs.title}` : `Chapter ${num}`;
      return {
        id: ch.id,
        title,
        chapter_number: num,
        upload_date: attrs.publishAt ? new Date(attrs.publishAt).toLocaleDateString() : '',
        scanlator: 'MangaDex'
      };
    });
    return chapters;
  },

  async getPages(chapterId) {
    const url = `${this.API_BASE}/at-home/server/${chapterId}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const data = await res.json();
    if (!data.baseUrl || !data.chapter) throw new Error('Chapter pages unavailable');
    const hash = data.chapter.hash;
    const pages = (data.chapter.data || []).map((fn, idx) => ({
      index: idx,
      url: `${data.baseUrl}/data/${hash}/${fn}`
    }));
    return { pages };
  }
};

// ---------------------------------------------------------------------------
// Main Vercel Serverless Route Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=1800');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { route = [] } = req.query;
  const pathParts = Array.isArray(route) ? route : (route ? route.split('/') : []);

  try {
    // 1. GET /api/sources
    if (pathParts.length === 0) {
      return res.status(200).json(SOURCES);
    }

    const [sourceId, action, ...rest] = pathParts;

    if (sourceId === 'mangadex' || sourceId === '2499283573021220255') {
      const page = parseInt(req.query.page || '1', 10);

      if (action === 'popular') {
        const result = await MangaDex.getPopular(page);
        return res.status(200).json(result);
      }

      if (action === 'latest') {
        const result = await MangaDex.getLatest(page);
        return res.status(200).json(result);
      }

      if (action === 'search') {
        const q = req.query.q || '';
        const result = await MangaDex.search(q, page);
        return res.status(200).json(result);
      }

      if (action === 'manga' && rest[0]) {
        const mangaId = rest[0];
        if (rest[1] === 'chapters') {
          const chapters = await MangaDex.getChapters(mangaId);
          return res.status(200).json({ chapters });
        }
        const details = await MangaDex.getDetails(mangaId);
        return res.status(200).json(details);
      }

      if (action === 'chapter' && rest[0] && rest[1] === 'pages') {
        const chapterId = rest[0];
        const pages = await MangaDex.getPages(chapterId);
        return res.status(200).json(pages);
      }
    }

    // Default response for other sources or unhandled actions
    return res.status(200).json({ manga: [], has_next: false, chapters: [], pages: [] });
  } catch (err) {
    console.error('Source handler error:', err);
    return res.status(500).json({ error: err.message });
  }
}

