// Serves the app for article, section and help pages with that page's own
// title, description and share preview filled in, so search engines and
// link previews (iMessage, Instagram, Discord...) show the right thing.
// The page itself is still the normal React app.
//
//   /article/:id   -> /api/page?id=:id
//   /toolkit etc.  -> /api/page?page=toolkit

const fs = require("fs");
const path = require("path");

const SITE = "https://safespaceblog.vercel.app";
const BRAND = "The Safe Space Blog";
const PAGES = {
  "reality-check": { title: "The Reality Check", desc: "Real stories from people your age about what anxiety, stress, loneliness and hard days actually felt like." },
  "mind-mechanics": { title: "Mind Mechanics", desc: "What's going on in your brain and body when you feel anxious, low or overwhelmed, explained without the jargon." },
  "toolkit": { title: "The Toolkit", desc: "Small, specific coping tools to try when a day gets heavy: breathing, grounding, sleep, worry and more." },
  "talk": { title: "Talk to someone", desc: "Free, confidential help 24/7. Call or text 988, or text HOME to 741741. Plus a quick check-in and one small thing to try right now." },
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonLd = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

function excerpt(body, n = 155) {
  const t = String(body || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const c = t.slice(0, n);
  return c.slice(0, c.lastIndexOf(" ")) + "…";
}

async function template(req) {
  for (const p of [path.join(process.cwd(), "build", "index.html"), path.join(__dirname, "..", "build", "index.html")]) {
    try { return fs.readFileSync(p, "utf8"); } catch {}
  }
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const r = await fetch(`${proto}://${host}/index.html`);
  if (!r.ok) throw new Error(`template ${r.status}`);
  return r.text();
}

async function article(id) {
  const url = process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!url || !key || !/^[\w-]{1,64}$/.test(id)) return null;
  const r = await fetch(`${url}/rest/v1/articles?select=data&id=eq.${encodeURIComponent(id)}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!r.ok) return null;
  const rows = await r.json();
  const a = rows && rows[0] && rows[0].data;
  return a && a.isApproved ? a : null;
}

function head({ title, desc, url, type = "website", noindex = false, ld }) {
  const img = `${SITE}/og-image.png`;
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    noindex ? `<meta name="robots" content="noindex">` : "",
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${img}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${img}">`,
    ld ? `<script type="application/ld+json">${jsonLd(ld)}</script>` : "",
  ].join("");
}

function inject(html, block) {
  const cleaned = html
    .replace(/<title[^>]*data-seo[^>]*>[\s\S]*?<\/title>/i, "")
    .replace(/<script[^>]*data-seo[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<(meta|link)[^>]*data-seo[^>]*>/gi, "");
  return cleaned.replace(/<\/head>/i, `${block}</head>`);
}

module.exports = async function handler(req, res) {
  const id = typeof req.query.id === "string" ? req.query.id : "";
  const page = typeof req.query.page === "string" ? req.query.page : "";
  let html;
  try {
    html = await template(req);
  } catch (e) {
    // Couldn't load the app shell: fall back to the old-style link, which the
    // app converts back to this address on load.
    console.error("page template failed", e);
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(307, id ? `/#/article/${encodeURIComponent(id)}` : `/#/${encodeURIComponent(page)}`);
  }

  let block, status = 200;
  try {
    if (id) {
      const a = await article(id);
      if (a) {
        const url = `${SITE}/article/${encodeURIComponent(id)}`;
        const desc = excerpt(a.body);
        block = head({
          title: `${a.title} · ${BRAND}`, desc, url, type: "article",
          ld: {
            "@context": "https://schema.org", "@type": "BlogPosting",
            headline: a.title, description: desc, url, mainEntityOfPage: url,
            datePublished: a.submittedAt, image: `${SITE}/og-image.png`,
            author: { "@type": a.authorName === "SafeSpace Team" ? "Organization" : "Person", name: a.authorName },
            publisher: { "@type": "Organization", name: BRAND, logo: { "@type": "ImageObject", url: `${SITE}/icon-512.png` } },
            articleSection: (PAGES[a.category] || {}).title, inLanguage: "en",
          },
        });
      } else {
        status = 404;
        block = head({ title: `Story not found · ${BRAND}`, desc: "This story may have been moved or taken down.", url: `${SITE}/`, noindex: true });
      }
    } else if (PAGES[page]) {
      const p = PAGES[page];
      block = head({ title: `${p.title} · ${BRAND}`, desc: p.desc, url: `${SITE}/${page}` });
    }
  } catch (e) {
    console.error("page meta failed", e);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");
  return res.status(status).send(block ? inject(html, block) : html);
};
