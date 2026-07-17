const SITE_URL = 'https://www.tademehl.com';
const GOOGLE_SITE_VERIFICATION = 'd4WLzoBzgHWWVP0CMIKncQP3WKHJY1kq8iPlbfwar4M';
const FAVICON_VERSION = '12';

const PAGES = {
  '/': {
    title: 'Tade Mehl — diary',
    description: 'Personal diary of Tade Mehl. Notes on robotics, startups, and building things people love.',
    includePersonSchema: true,
    googleSiteVerification: GOOGLE_SITE_VERIFICATION,
    ogImage: '/og-image.png',
  },
  '/bookshelf': {
    title: 'Tade Mehl — bookshelf',
    description: 'Books read by Tade Mehl.',
  },
  '/office': {
    title: 'Tade Mehl — office',
    description: 'Office — Tade Mehl.',
  },
  '/corner': {
    title: 'Tade Mehl — corner',
    description: 'Corner — Tade Mehl.',
  },
  '/ce': {
    title: 'Tade Mehl — company education',
    description: 'Company education videos curated by Tade Mehl.',
  },
};

const SITEMAP_PATHS = ['/', '/bookshelf', '/eisenkind', '/cause', '/office', '/corner', '/ce'];

function normalizePath(pathname) {
  if (!pathname || pathname === '/') return '/';
  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function getSeoForPath(pathname) {
  const path = normalizePath(pathname);

  if (path.startsWith('/admin')) {
    return {
      title: 'admin',
      description: '',
      path,
      noindex: true,
      includePersonSchema: false,
    };
  }

  const page = PAGES[path] || {
    title: 'Tade Mehl',
    description: 'Personal site of Tade Mehl.',
  };

  return {
    title: page.title,
    description: page.description,
    path,
    noindex: false,
    includePersonSchema: Boolean(page.includePersonSchema),
    googleSiteVerification: page.googleSiteVerification || null,
    ogImage: page.ogImage || null,
  };
}

function getCanonicalUrl(path) {
  const normalized = normalizePath(path);
  return normalized === '/' ? `${SITE_URL}/` : `${SITE_URL}${normalized}`;
}

function getPersonSchema() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        name: 'Tade Mehl',
        alternateName: ['Tadeus Mehl', 'Tadeus Jonathan Mehl', 'tademehl'],
        url: `${SITE_URL}/`,
        description: 'Founder and builder working on robotics, startups, and products people love.',
        sameAs: [
          'https://www.linkedin.com/in/tadeusmehl',
          'https://github.com/tadeus123',
        ],
      },
      {
        '@type': 'WebSite',
        name: 'Tade Mehl',
        alternateName: 'tademehl',
        url: `${SITE_URL}/`,
        author: {
          '@type': 'Person',
          name: 'Tade Mehl',
        },
      },
    ],
  };
}

function buildSitemapXml() {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = SITEMAP_PATHS.map((path) => {
    const loc = getCanonicalUrl(path);
    const priority = path === '/' ? '1.0' : '0.7';
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
  ].join('\n');
}

module.exports = {
  SITE_URL,
  FAVICON_VERSION,
  getSeoForPath,
  getCanonicalUrl,
  getPersonSchema,
  buildSitemapXml,
};
