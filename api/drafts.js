// Adds an AI-written draft to the site's Pending tab. Used by the daily
// SafeSpace scheduled task. Drafts are always saved as pending and
// unapproved; only the admin can publish them.
//
// POST /api/drafts
//   Authorization: Bearer <DRAFT_TOKEN>
//   { "title": "...", "body": "...", "category": "toolkit", "submittedAt": "YYYY-MM-DD" }

const CATEGORIES = ["mind-mechanics", "toolkit", "reality-check"];
const CLOSING = "This article was written with AI assistance and reviewed by the SafeSpace team before publishing.";

function bad(res, code, error) {
  return res.status(code).json({ error });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return bad(res, 405, "Method not allowed");
  }
  const token = process.env.DRAFT_TOKEN;
  const url = process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!token || !url || !key) return bad(res, 503, "Drafts are not configured");
  if ((req.headers.authorization || "") !== `Bearer ${token}`) return bad(res, 401, "Unauthorized");

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== "object") return bad(res, 400, "JSON body required");
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const body = typeof b.body === "string" ? b.body.trim() : "";
  const category = b.category;
  const submittedAt = typeof b.submittedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.submittedAt)
    ? b.submittedAt : new Date().toISOString().slice(0, 10);
  if (!title || title.length > 120) return bad(res, 400, "title is required (max 120 chars)");
  if (body.length < 200 || body.length > 20000) return bad(res, 400, "body must be 200-20000 chars");
  if (!CATEGORIES.includes(category)) return bad(res, 400, "invalid category");
  if (!body.includes(CLOSING)) return bad(res, 400, "body must include the AI-assistance closing paragraph");

  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  try {
    // Skip duplicates: same title already on the site.
    const q = `${url}/rest/v1/articles?select=id&data->>title=eq.${encodeURIComponent(title)}`;
    const existing = await fetch(q, { headers }).then((r) => (r.ok ? r.json() : []));
    if (Array.isArray(existing) && existing.length) return res.status(200).json({ ok: true, duplicate: true, id: existing[0].id });

    const id = typeof b.id === "number" && b.id > 0 ? Math.floor(b.id) : Date.now();
    const article = {
      id, authorId: "auto", authorName: "SafeSpace Team", title, body, category, submittedAt,
      isApproved: false, status: "pending", revisions: [], imageDataUrl: null, videoUrl: null, videoCaption: null,
    };
    const r = await fetch(`${url}/rest/v1/articles`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ id: String(id), data: article }),
    });
    if (!r.ok) {
      console.error("Supabase insert failed", r.status, await r.text().catch(() => ""));
      return bad(res, 502, "Could not save draft");
    }
    return res.status(201).json({ ok: true, id });
  } catch (e) {
    console.error("Draft error", e);
    return bad(res, 502, "Could not save draft");
  }
};
