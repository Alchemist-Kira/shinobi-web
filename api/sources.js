// Vercel Serverless Function: Manga Sources API
// Zero persistent database required - pure on-demand scraping and API normalization

const SOURCES = [];

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
    const list = (data.data || []).map(item => this.formatManga(item));
    const hasNext = (data.offset + data.limit) < (data.total || 0);
    return {
      items: list,
      manga: list,
      total: data.total || 0,
      page,
      limit: 24,
      has_next: hasNext
    };
  },

  async getLatest(page = 1) {
    const offset = (page - 1) * 24;
    const url = `${this.API_BASE}/manga?limit=24&offset=${offset}&includes[]=cover_art&order[latestUploadedChapter]=desc&contentRating[]=safe&contentRating[]=suggestive`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const data = await res.json();
    const list = (data.data || []).map(item => this.formatManga(item));
    const hasNext = (data.offset + data.limit) < (data.total || 0);
    return {
      items: list,
      manga: list,
      total: data.total || 0,
      page,
      limit: 24,
      has_next: hasNext
    };
  },

  async search(query, page = 1) {
    const offset = (page - 1) * 24;
    const url = `${this.API_BASE}/manga?title=${encodeURIComponent(query)}&limit=24&offset=${offset}&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    const data = await res.json();
    const list = (data.data || []).map(item => this.formatManga(item));
    const hasNext = (data.offset + data.limit) < (data.total || 0);
    return {
      items: list,
      manga: list,
      total: data.total || 0,
      page,
      limit: 24,
      has_next: hasNext
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
// MangaFire Scraper / Normalizer with VRF Signature
// ---------------------------------------------------------------------------
const TABLE_1 = 'yINlmUNho8VYJT+ibTIP+9ESiULpVEtMOoD6U6lRE0R/xwXo/Xp9NrUgC4cw/Lmo33vUyjUE40kUoEWIr/fxfNNcq2s79ShQ5NhNrFnJ4hXPwOu/SuXzIbuTQKGFvfm08E9jvCfqAtoDqvQq3dVWPQFmJjgvkISBeXY3BgANR+yVnjGbcxZ47d6kLNfZPIayTq3/YGySb1KuVZodWp/WGNAO5pfMcpaK53Hhs0allBszaMaxuouOwdxbwgxIw6YunSsXjI05Yi0j9j4eHKfSXR8Ifo/Od+8iamRfCXTyvm7NGRGYdcQ0ywcK/u6RXhrbcCm4t2eCtrDgQVecJGkQ+A==';
const KEY_1 = '0Ec58JOY3uBzJK9m3zqIOpdlF7UFiax9DmA=';
const TABLE_2 = 'IUFltCxD3Oc2cwCgkJffthaOg9cgPUb0LgW6H/VtfcF0kc5F25t+aWj6JH9VOhOaY0rAFdUxlDnl5BLNvwEJvQtP5qcw7vdb/K+chnbwnspSHT8mz5lqwz41TezG0hkO06FTjJZhsyNuFLDpD2ZZxQj/QIRcF90zpmQ7Byu483WsQqUE0C342HL+JXngRB6fRzxRyVTaKu83h7UYTJ0QMt6ixFh6S3F8gqkKwrGTL3jHNBsD45UnifK8+RGtishQV2K3rujLKEkiZxpr2dYcudFW4oFsDKhad3CLBvuyTqsCo4B7mL5IKQ1vXo/MOOvq1I1d8ar9X6Ttu5KF4fZgiA==';
const KEY_2 = 'AAdjb1iPY8CiDmq9H34tKTBF8a3oDQ==';
const TABLE_3 = 'NQHlu1/wVO5EmkwQymF810qqY2xG1k2obcas4Z9mCsPEIFl9pRIjFxbJ7ybMHbBckT5Ton85E0FOeHezbh/mjlEYpmpnlXOS8dgrqeq2KfxImTh1YK9y0PeMNhzA1OQzSY9brYOJq/l2QnE/hwOeZIhPixVSKIUlDb5vLcH6RWKxkIEMuP0bDwIqQ71AJJaEaMJL7A6YtyIwoRT+L5v4aZzodN/0+3nOGsfblFjgxSfPzVDjNFeNl5P26+kEC/8AHgdrpAbt3hHz3HrRN1Y6e+JHgF7ncFWnoF0y3THL1S71WgWGCa6KtSzTCCG58n68nTyj2T3Sshk7utqCtMi/ZQ==';
const KEY_3 = 'DELOJgPsVaCcblDtTGMdHzM=';

const STAGES = [
  [Buffer.from(TABLE_1, 'base64'), Buffer.from(KEY_1, 'base64'), 0x5A],
  [Buffer.from(TABLE_2, 'base64'), Buffer.from(KEY_2, 'base64'), 0x35],
  [Buffer.from(TABLE_3, 'base64'), Buffer.from(KEY_3, 'base64'), 0xBA]
];

function vrfSign(path) {
  let data = Buffer.from(path, 'utf8');
  for (const [table, key, iv] of STAGES) {
    const out = Buffer.alloc(data.length);
    let prev = iv;
    const keySize = key.length;
    for (let i = 0; i < data.length; i++) {
      prev = table[(data[i] ^ key[i % keySize] ^ prev) & 0xFF];
      out[i] = prev;
    }
    data = out;
  }
  return data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const MangaFire = {
  BASE_URL: 'https://mangafire.to',

  async callApi(endpoint, paramList = []) {
    const params = [...paramList].sort((a, b) => a[0].localeCompare(b[0]));
    const subPath = endpoint.replace('/api', '');

    let lastKey = '';
    let idx = 0;
    const queryParts = [];
    for (const [k, v] of params) {
      let newK = k;
      if (k.endsWith('[]')) {
        if (lastKey !== k) idx = 0;
        lastKey = k;
        newK = k.replace('[]', `[${idx}]`);
        idx++;
      }
      queryParts.push(`${newK}=${v}`);
    }

    const pathToSign = subPath + (queryParts.length > 0 ? '?' + queryParts.join('&') : '');
    const vrf = vrfSign(pathToSign);

    const searchParams = new URLSearchParams();
    for (const [k, v] of params) {
      searchParams.append(k, v);
    }
    const qs = searchParams.toString();
    const fullUrl = `${this.BASE_URL}${endpoint}${qs ? '?' + qs + '&' : '?'}vrf=${encodeURIComponent(vrf)}`;

    const res = await fetch(fullUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Referer': 'https://mangafire.to/',
        'Accept': 'application/json'
      }
    });
    if (!res.ok) throw new Error(`MangaFire error ${res.status}`);
    return await res.json();
  },

  formatItem(item) {
    const poster = item.poster || {};
    const coverUrl = poster.medium || poster.large || poster.small || '/static/img/default-cover.png';
    const rawStatus = (item.status || '').toLowerCase();
    const statusMap = {
      releasing: 'Ongoing',
      finished: 'Completed',
      on_hiatus: 'On Hiatus',
      discontinued: 'Cancelled'
    };
    return {
      id: 'mangafire_' + (item.hid || item.id) + (item.slug ? '-' + item.slug : ''),
      title: item.title || 'Untitled Manga',
      cover_url: coverUrl,
      status: statusMap[rawStatus] || 'Ongoing',
      source: '6084907896154116083',
      source_name: 'MangaFire'
    };
  },

  async getPopular(page = 1) {
    const params = [
      ['content_rating[]', 'safe'],
      ['content_rating[]', 'suggestive'],
      ['limit', '24'],
      ['order[views_30d]', 'desc'],
      ['page', String(page)]
    ];
    const data = await this.callApi('/api/titles', params);
    const items = (data.items || []).map(item => this.formatItem(item));
    const meta = data.meta || {};
    const hasNext = meta.hasNext !== undefined ? meta.hasNext : (items.length === 24);
    const total = (meta.lastPage || (page + (hasNext ? 1 : 0))) * 24;
    return {
      items,
      manga: items,
      total,
      page,
      limit: 24,
      has_next: hasNext
    };
  },

  async getLatest(page = 1) {
    const params = [
      ['content_rating[]', 'safe'],
      ['content_rating[]', 'suggestive'],
      ['limit', '24'],
      ['order[chapter_updated_at]', 'desc'],
      ['page', String(page)]
    ];
    const data = await this.callApi('/api/titles', params);
    const items = (data.items || []).map(item => this.formatItem(item));
    const meta = data.meta || {};
    const hasNext = meta.hasNext !== undefined ? meta.hasNext : (items.length === 24);
    const total = (meta.lastPage || (page + (hasNext ? 1 : 0))) * 24;
    return {
      items,
      manga: items,
      total,
      page,
      limit: 24,
      has_next: hasNext
    };
  },

  async search(query, page = 1) {
    const params = [
      ['content_rating[]', 'safe'],
      ['content_rating[]', 'suggestive'],
      ['limit', '24'],
      ['page', String(page)]
    ];
    if (query) {
      params.push(['keyword', query]);
      params.push(['order[relevance]', 'desc']);
    } else {
      params.push(['order[views_30d]', 'desc']);
    }
    const data = await this.callApi('/api/titles', params);
    const items = (data.items || []).map(item => this.formatItem(item));
    const meta = data.meta || {};
    const hasNext = meta.hasNext !== undefined ? meta.hasNext : (items.length === 24);
    const total = (meta.lastPage || (page + (hasNext ? 1 : 0))) * 24;
    return {
      items,
      manga: items,
      total,
      page,
      limit: 24,
      has_next: hasNext
    };
  },

  extractHid(mangaId) {
    const raw = String(mangaId).replace(/^mangafire_/, '').trim();
    if (raw.includes('-')) {
      const candidate = raw.split('-')[0];
      if (candidate.length <= 10) return candidate;
    }
    return raw;
  },

  async getDetails(mangaId) {
    const hid = this.extractHid(mangaId);
    let data = await this.callApi(`/api/titles/${hid}`);
    let mData = data.data;
    if (!mData) {
      const cleanQ = mangaId.replace('mangafire_', '').replace(/-/g, ' ');
      const sData = await this.callApi('/api/titles', [['keyword', cleanQ], ['limit', '5'], ['page', '1']]);
      const sItems = sData.items || [];
      if (sItems.length > 0 && sItems[0].hid) {
        data = await this.callApi(`/api/titles/${sItems[0].hid}`);
        mData = data.data;
      }
    }
    if (!mData) throw new Error('Manga not found');

    const poster = mData.poster || {};
    const coverUrl = poster.large || poster.medium || poster.small || '/static/img/default-cover.png';
    const authors = (mData.authors || []).map(a => a.title).filter(Boolean);
    const artists = (mData.artists || []).map(a => a.title).filter(Boolean);
    const genres = (mData.genres || []).concat(mData.themes || []).map(g => g.title).filter(Boolean);
    const desc = (mData.synopsisHtml || '').replace(/<[^>]*>/g, '').trim();

    return {
      id: mangaId,
      source: '6084907896154116083',
      source_name: 'MangaFire',
      title: mData.title || 'Unknown',
      cover_url: coverUrl,
      summary: desc,
      description: desc,
      author: authors.join(', '),
      artist: artists.join(', '),
      genres,
      status: mData.status || 'Ongoing'
    };
  },

  async getChapters(mangaId) {
    const hid = this.extractHid(mangaId);
    const params = [
      ['language', 'en'],
      ['limit', '500'],
      ['order', 'desc'],
      ['page', '1'],
      ['sort', 'number']
    ];
    const data = await this.callApi(`/api/titles/${hid}/chapters`, params);
    const items = data.items || [];
    return items.map((c, idx) => ({
      id: `mangafire_ch_${c.id}`,
      manga_id: mangaId,
      title: c.name ? `Chapter ${c.number}: ${c.name}` : `Chapter ${c.number || idx + 1}`,
      chapter_number: String(c.number || idx + 1),
      upload_date: c.createdAt ? new Date(c.createdAt * 1000).toLocaleDateString() : '',
      scanlator: 'MangaFire'
    }));
  },

  async getPages(chapterId) {
    const rawId = String(chapterId).replace(/^mangafire_ch_/, '').split('-')[0];
    const data = await this.callApi(`/api/chapters/${rawId}`);
    const pages = (data.data?.pages || []).map((p, idx) => ({
      index: idx,
      url: p.url
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

  // Extract path parts from req.query.route or fallback to req.url pathname
  let pathParts = [];
  if (req.query && req.query.route) {
    pathParts = Array.isArray(req.query.route) ? req.query.route : req.query.route.split('/').filter(Boolean);
  } else {
    const urlPath = (req.url || '').split('?')[0];
    const match = urlPath.match(/^\/api\/sources\/?(.*)/);
    if (match && match[1]) {
      pathParts = match[1].split('/').filter(Boolean);
    }
  }

  try {
    // 1. GET /api/sources (Directory index)
    if (pathParts.length === 0) {
      return res.status(200).json(SOURCES);
    }

    const [sourceId, action, ...rest] = pathParts;
    const isMangaDex = sourceId === 'mangadex' || sourceId === '2499283573021220255';
    const isMangaFire = sourceId === 'mangafire' || sourceId === '6084907896154116083' || (sourceId && sourceId.includes('mangafire'));

    // Handle MangaDex
    if (isMangaDex) {
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

    // Handle MangaFire
    if (isMangaFire) {
      const page = parseInt(req.query.page || '1', 10);

      if (action === 'popular') {
        const result = await MangaFire.getPopular(page);
        return res.status(200).json(result);
      }

      if (action === 'latest') {
        const result = await MangaFire.getLatest(page);
        return res.status(200).json(result);
      }

      if (action === 'search') {
        const q = req.query.q || req.query.keyword || '';
        const result = await MangaFire.search(q, page);
        return res.status(200).json(result);
      }

      if (action === 'manga' && rest[0]) {
        const mangaId = rest[0];
        if (rest[1] === 'chapters') {
          const chapters = await MangaFire.getChapters(mangaId);
          return res.status(200).json({ chapters });
        }
        const details = await MangaFire.getDetails(mangaId);
        return res.status(200).json(details);
      }

      if (action === 'chapter' && rest[0] && rest[1] === 'pages') {
        const chapterId = rest[0];
        const pages = await MangaFire.getPages(chapterId);
        return res.status(200).json(pages);
      }
    }

    // Default safe fallback response for other sources or unhandled actions
    return res.status(200).json({
      items: [],
      manga: [],
      has_next: false,
      chapters: [],
      pages: [],
      total: 0,
      message: "This extension requires running Shinobi locally with the engine (python run.py). MangaFire and MangaDex are supported directly on the cloud."
    });
  } catch (err) {
    console.error('Source handler error:', err);
    return res.status(200).json({
      items: [],
      manga: [],
      has_next: false,
      chapters: [],
      pages: [],
      total: 0,
      message: err.message || "Failed to load titles from this source."
    });
  }
}
