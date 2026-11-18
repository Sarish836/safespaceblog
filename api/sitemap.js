// Live sitemap for search engines: the main pages plus every published
// story. Pending drafts are never listed.  /sitemap.xml -> /api/sitemap

const SITE = "https://safespaceblog.vercel.app";
const STATIC = ["", "reality-check", "mind-mechanics", "toolkit", "talk"];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

module.exports = async function handler(req, res) {
  const url = process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
  let articles = [];
  try {
    if (url && key) {
      const r = await fetch(`${url}/rest/v1/articles?select=id,data&data->>isApproved=eq.true`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (r.ok) articles = (await r.json()).filter((row) => row && row.data && row.data.isApproved === true);
    }
  } catch (e) {
    console.error("sitemap fetch failed", e);
  }

  const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(s || "") ? String(s).slice(0, 10) : null);
  const newest = articles.map((a) => day(a.data.submittedAt)).filter(Boolean).sort().pop();

  const urls = [
    ...STATIC.map((p) => ({ loc: `${SITE}/${p}`, lastmod: p === "talk" ? null : newest })),
    ...articles.map((a) => ({ loc: `${SITE}/article/${encodeURIComponent(a.id)}`, lastmod: day(a.data.submittedAt) })),
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`).join("\n") +
    `\n</urlset>\n`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  return res.status(200).send(xml);
};
