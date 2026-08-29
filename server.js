import "dotenv/config";
import express from "express";
import nodemailer from "nodemailer";
import dns from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY = process.env.GOOGLE_MAPS_API_KEY;
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.VERCEL ? path.join("/tmp", "bushra-leads") : path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "leads.json");

const NEGATIVE_KEYWORDS = [
  "software development",
  "software agency",
  "software house",
  "software consultancy",
  "web development",
  "web design",
  "digital agency",
  "app development",
  "mobile app development",
  "custom software",
  "it services",
  "it consultancy",
  "it consulting",
  "software engineering",
  "offshore development",
  "dev shop",
  "dev agency",
  "staff augmentation",
  "software consulting",
  "softwareunternehmen",
  "softwareentwicklung",
  "webagentur",
  "digitalagentur",
  "it-dienstleister",
  "software solutions provider"
];

const INDUSTRY_CATEGORIES = {
  "All Target Clients (Logistics, Legal, E-com, Finance, Health)": [
    "logistics company",
    "freight forwarding",
    "supply chain",
    "law firm",
    "corporate law",
    "e-commerce brand",
    "online retailer",
    "accounting firm",
    "tax consultancy",
    "medical clinic",
    "wealth management",
    "property management",
    "manufacturing company",
    "biotech startup",
    "cleantech startup"
  ],
  "Logistics & Supply Chain (CRM/Tracking)": [
    "logistics company",
    "freight forwarding company",
    "supply chain management",
    "transport and logistics",
    "cargo shipping company",
    "warehousing company"
  ],
  "Law Firms & Legaltech": [
    "law firm",
    "corporate law firm",
    "commercial law firm",
    "patent attorney",
    "legal consultancy",
    "notary office"
  ],
  "E-Commerce & Retail Brands": [
    "e-commerce company",
    "online retail brand",
    "direct to consumer brand",
    "fashion brand headquarters",
    "cosmetics brand headquarters",
    "wholesale distribution"
  ],
  "Fintech & Accounting / Professional Services": [
    "accounting firm",
    "tax consultancy firm",
    "auditing firm",
    "wealth management firm",
    "financial advisory company",
    "insurance broker"
  ],
  "Healthcare & Clinics": [
    "private medical clinic",
    "specialist medical center",
    "diagnostic center",
    "dental clinic",
    "telehealth provider",
    "health services"
  ],
  "Real Estate & Property Management": [
    "real estate agency",
    "property management company",
    "commercial real estate",
    "real estate investment firm"
  ],
  "Non-Tech Startups & Manufacturing": [
    "biotech startup",
    "cleantech company",
    "edtech company",
    "manufacturing company",
    "industrial manufacturing"
  ]
};

const CITIES = {
  Germany: ["Berlin", "Munich", "Hamburg", "Frankfurt", "Cologne"],
  Austria: ["Vienna", "Graz", "Linz", "Salzburg"],
  Canada: ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa"],
  Norway: ["Oslo", "Bergen", "Stavanger"],
  Singapore: ["Singapore"],
  "United States": ["New York", "San Francisco", "Austin", "Seattle", "Chicago", "Boston", "Los Angeles"],
  Switzerland: ["Zurich", "Geneva", "Basel"],
  Netherlands: ["Amsterdam", "Rotterdam", "Utrecht"],
  Belgium: ["Brussels", "Antwerp", "Ghent"],
  France: ["Paris", "Lyon", "Lille", "Marseille"],
  Sweden: ["Stockholm", "Gothenburg"],
  Denmark: ["Copenhagen", "Aarhus"],
  Finland: ["Helsinki", "Tampere"],
  Poland: ["Warsaw", "Krakow", "Wroclaw"],
  "Czech Republic": ["Prague", "Brno"],
  Ireland: ["Dublin", "Cork"],
  Spain: ["Madrid", "Barcelona", "Valencia"],
  Italy: ["Milan", "Rome", "Turin"],
  Portugal: ["Lisbon", "Porto"],
  Luxembourg: ["Luxembourg"],
  Estonia: ["Tallinn"],
  "United Kingdom": ["London", "Manchester", "Birmingham"],
  England: ["London", "Manchester", "Bristol"],
  Scotland: ["Edinburgh", "Glasgow"],
  Wales: ["Cardiff", "Swansea"],
  "Northern Ireland": ["Belfast"],
  Iceland: ["Reykjavik"],
  Liechtenstein: ["Vaduz"],
  Monaco: ["Monaco"],
  Andorra: ["Andorra la Vella"],
  Malta: ["Valletta"],
  "San Marino": ["San Marino"],
  Greece: ["Athens", "Thessaloniki"],
  Hungary: ["Budapest"],
  Slovakia: ["Bratislava"],
  Slovenia: ["Ljubljana"],
  Croatia: ["Zagreb", "Split"],
  Romania: ["Bucharest", "Cluj-Napoca"],
  Bulgaria: ["Sofia", "Plovdiv"],
  Serbia: ["Belgrade"],
  "Bosnia and Herzegovina": ["Sarajevo"],
  Montenegro: ["Podgorica"],
  "North Macedonia": ["Skopje"],
  Albania: ["Tirana"],
  Kosovo: ["Pristina"],
  Latvia: ["Riga"],
  Lithuania: ["Vilnius"],
  Ukraine: ["Kyiv", "Lviv"],
  Moldova: ["Chisinau"],
  Belarus: ["Minsk"],
  Gibraltar: ["Gibraltar"],
  "Isle of Man": ["Douglas"],
  Jersey: ["Saint Helier"],
};

const SKIP_LOCAL = /^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|abuse|privacy|legal|spam|test|example|fake|dummy|webmaster|admin)$/i;
const SKIP_HOST = /^(example\.com|google\.com|gmail\.google\.com|sentry\.io|wixpress\.com|schema\.org|w3\.org|cloudflare\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|googleapis\.com|gstatic\.com|wix\.com|squarespace\.com|wordpress\.com|godaddy\.com|shopify\.com)$/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BAD_EXT = /\.(png|jpe?g|gif|webp|svg|css|js|woff2?|mp4|pdf)$/i;

function loadDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ emails: [], domains: [], leads: [], sent: [], names: [] }));
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  db.emails ||= [];
  db.domains ||= [];
  db.leads ||= [];
  db.sent ||= [];
  db.names ||= [];
  return db;
}

function normName(n) {
  return String(n || "")
    .toLowerCase()
    .replace(/\b(gmbh|ag|ltd|limited|llc|inc|srl|bv|nv|oy|ab|as|sa|sas|plc|kg)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db));
}

function domainOf(email) {
  return email.split("@")[1]?.toLowerCase() || "";
}

function rootHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function validFormat(email) {
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) return false;
  const [local, host] = email.split("@");
  if (!local || !host || SKIP_LOCAL.test(local) || SKIP_HOST.test(host)) return false;
  if (BAD_EXT.test(email) || email.includes("..") || local.startsWith(".") || local.endsWith(".")) return false;
  return true;
}

async function hasMx(host) {
  try {
    const mx = await dns.resolveMx(host);
    return Array.isArray(mx) && mx.length > 0;
  } catch {
    return false;
  }
}

async function placesText(query) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", KEY);
  const r = await fetch(url);
  return r.json();
}

async function placesNext(token) {
  await new Promise((s) => setTimeout(s, 2200));
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("pagetoken", token);
  url.searchParams.set("key", KEY);
  const r = await fetch(url);
  return r.json();
}

async function placeWebsite(placeId) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "name,website");
  url.searchParams.set("key", KEY);
  const r = await fetch(url);
  const j = await r.json();
  return j.result || {};
}

async function fetchHtml(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 BushraTechLeadFinder/1.0", Accept: "text/html" },
    });
    if (!r.ok) return "";
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return "";
    return (await r.text()).slice(0, 400000);
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

function extractEmails(html) {
  const set = new Set();
  const mailto = html.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi);
  for (const m of mailto) set.add(m[1].toLowerCase());
  const body = html.match(EMAIL_RE) || [];
  for (const e of body) set.add(e.toLowerCase());
  return [...set].filter(validFormat);
}

async function emailsFromSite(website) {
  const origin = website.replace(/\/$/, "");
  const pages = [origin, `${origin}/contact`, `${origin}/contact-us`, `${origin}/about`];
  const found = new Set();
  for (const p of pages) {
    const html = await fetchHtml(p);
    if (!html) continue;
    for (const e of extractEmails(html)) found.add(e);
    if (found.size) break;
  }
  const host = rootHost(website);
  const list = [...found];
  const own = list.filter((e) => {
    const d = domainOf(e);
    return d === host || d.endsWith(`.${host}`) || host.endsWith(`.${d}`);
  });
  return own.length ? own : list;
}

function isCompetitorOrAgency(name, text = "") {
  const checkName = (name || "").toLowerCase();
  for (const kw of NEGATIVE_KEYWORDS) {
    if (checkName.includes(kw)) return true;
  }
  if (text) {
    const lower = text.toLowerCase();
    for (const kw of NEGATIVE_KEYWORDS) {
      if (lower.includes(kw) && (
        lower.includes("we build") || 
        lower.includes("our development team") || 
        lower.includes("hire dedicated developers") || 
        lower.includes("custom software development") ||
        lower.includes("softwareentwicklung")
      )) {
        return true;
      }
    }
  }
  return false;
}

function queriesFor(country, categoryKey) {
  const cities = CITIES[country] || [""];
  const industries = (categoryKey && INDUSTRY_CATEGORIES[categoryKey])
    ? INDUSTRY_CATEGORIES[categoryKey]
    : INDUSTRY_CATEGORIES["All Target Clients (Logistics, Legal, E-com, Finance, Health)"];
  const out = [];
  for (const city of cities) {
    for (const ind of industries) {
      out.push(city ? `${ind} in ${city}, ${country}` : `${ind} in ${country}`);
    }
  }
  return out;
}

function mailReady() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function pitch(name) {
  const raw = name && name !== "—" ? name : "your team";
  const company = String(raw).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const site = "https://bushratech.com";
  const subject = `A product partner for ${raw} — Bushra Tech`;
  const text = `Hello ${raw},

Bushra Technology & Services is an AI SaaS product partner — we design, build, and ship intelligent software for founders and enterprises, from first idea to scale.

We help companies like yours with:
• Custom software development
• AI solutions and automation
• Cloud, mobile apps, and Web3 products

We've shipped products that grow, including SMART Insight (AI business intelligence) and Next Global Express (logistics tracking & CRM), plus a legal SaaS platform now valued at $35M.

If you are exploring a new product, AI inside an existing workflow, or a rebuild that needs to hold up in production, we would be glad to talk.

See our work: ${site}

Warm regards,
Bushra Tech
${site}`;
  const html = `<div style="font-family:Georgia,serif;color:#1a1814;line-height:1.6;max-width:560px">
<p>Hello ${company},</p>
<p><strong>Bushra Technology &amp; Services</strong> is your AI SaaS product partner from idea to scale. We design, build, and ship intelligent software for founders and enterprises — legaltech, e-commerce, logistics, and beyond.</p>
<p>We can help with custom software, AI solutions, cloud, mobile apps, and Web3. Selected work includes <em>SMART Insight</em> (AI business intelligence) and <em>Next Global Express</em> (logistics tracking &amp; CRM).</p>
<p>If you are building something new or want AI that actually ships, let's talk.</p>
<p><a href="${site}">bushratech.com</a></p>
<p>Warm regards,<br/>Bushra Tech</p>
</div>`;
  return { subject, text, html };
}

function formatEmail(name, customTemplate) {
  if (customTemplate && typeof customTemplate.subject === "string" && typeof customTemplate.body === "string") {
    const raw = name && name !== "—" ? name : "your team";
    const sub = customTemplate.subject.replace(/\{\{\s*(name|company)\s*\}\}/gi, raw);
    const textBody = customTemplate.body.replace(/\{\{\s*(name|company)\s*\}\}/gi, raw);
    const escaped = textBody.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const htmlBody = `<div style="font-family:Georgia,serif;color:#1a1814;line-height:1.6;max-width:560px;white-space:pre-wrap;">${escaped}</div>`;
    return { subject: sub, text: textBody, html: htmlBody };
  }
  return pitch(name);
}

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/countries", (_req, res) => {
  res.json(Object.keys(CITIES));
});

app.get("/api/industries", (_req, res) => {
  res.json(Object.keys(INDUSTRY_CATEGORIES));
});

app.get("/api/generate", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  if (!KEY) {
    send({ error: "Add GOOGLE_MAPS_API_KEY to .env and restart." });
    return res.end();
  }

  const country = String(req.query.country || "");
  const industry = String(req.query.industry || "");
  const count = Math.min(2000, Math.max(1, Number(req.query.count) || 50));
  if (!CITIES[country]) {
    send({ error: "Select a valid country." });
    return res.end();
  }

  const db = loadDb();
  const usedEmail = new Set(db.emails.map((e) => String(e).toLowerCase()));
  const usedDomain = new Set(db.domains.map((d) => String(d).toLowerCase()));
  const usedName = new Set((db.names || []).concat(db.leads.map((l) => normName(l.name))).filter(Boolean));
  const seenPlace = new Set();
  const results = [];
  const queries = queriesFor(country, industry);
  let q = 0;
  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });

  try {
    while (results.length < count && q < queries.length && !aborted) {
      const query = queries[q++];
      send({ status: `Searching: ${query}`, found: results.length, target: count });

      let data = await placesText(query);
      if (data.status === "REQUEST_DENIED") {
        send({ error: data.error_message || "Google Places request denied. Enable Places API for this key." });
        return res.end();
      }

      let pages = 0;
      while (data.status === "OK" && results.length < count && !aborted && pages < 3) {
        for (const place of data.results || []) {
          if (aborted || results.length >= count) break;
          if (seenPlace.has(place.place_id)) continue;
          seenPlace.add(place.place_id);

          if (isCompetitorOrAgency(place.name)) continue;

          const nm = normName(place.name);
          if (nm && usedName.has(nm)) continue;
          send({ status: `Checking ${place.name}`, found: results.length, target: count });
          const details = await placeWebsite(place.place_id);
          const website = details.website;
          if (!website || !/^https?:\/\//i.test(website)) continue;

          const host = rootHost(website);
          if (!host || usedDomain.has(host)) continue;
          const company = details.name || place.name;
          if (isCompetitorOrAgency(company)) continue;
          const cn = normName(company);
          if (cn && usedName.has(cn)) continue;

          const emails = await emailsFromSite(website);
          for (const email of emails) {
            const d = domainOf(email);
            if (usedEmail.has(email) || usedDomain.has(d) || usedDomain.has(host)) continue;
            if (!(await hasMx(d))) continue;

            usedEmail.add(email);
            usedDomain.add(d);
            usedDomain.add(host);
            if (cn) usedName.add(cn);
            const lead = { name: company, email, country };
            results.push(lead);
            db.emails.push(email);
            db.domains.push(d, host);
            db.names.push(cn);
            db.leads.push({ ...lead, at: new Date().toISOString() });
            send({ found: results.length, target: count, lead });
            break;
          }
        }
        if (!data.next_page_token || results.length >= count || aborted) break;
        pages++;
        data = await placesNext(data.next_page_token);
      }
    }

    saveDb(db);
    send({ done: true, found: results.length, target: count, leads: results });
  } catch (err) {
    send({ error: err.message || "Search failed." });
  }
  res.end();
});

app.get("/api/mail-ready", (_req, res) => {
  res.json({ ready: mailReady() });
});

app.post("/api/send", async (req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson");
  const write = (obj) => res.write(JSON.stringify(obj) + "\n");
  if (!mailReady()) {
    write({ error: "Add SMTP_USER and SMTP_PASS to .env, then restart." });
    return res.end();
  }
  const incoming = Array.isArray(req.body?.leads) ? req.body.leads : [];
  const customTemplate = req.body?.customTemplate;
  const db = loadDb();
  if (!Array.isArray(db.sent)) db.sent = [];
  const sentSet = new Set(db.sent);
  const mailer = transporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const total = incoming.length;
  for (let i = 0; i < incoming.length; i++) {
    const email = String(incoming[i]?.email || "").trim().toLowerCase();
    const name = String(incoming[i]?.name || "").trim();
    if (!email.includes("@") || sentSet.has(email)) {
      skipped++;
      write({ email, status: "skipped", sent, failed, skipped, doneCount: i + 1, total });
      continue;
    }
    try {
      const msg = formatEmail(name, customTemplate);
      await mailer.sendMail({ from, to: email, ...msg });
      sentSet.add(email);
      db.sent.push(email);
      sent++;
      write({ email, status: "sent", sent, failed, skipped, doneCount: i + 1, total });
    } catch {
      failed++;
      write({ email, status: "failed", sent, failed, skipped, doneCount: i + 1, total });
    }
    await new Promise((s) => setTimeout(s, 1200));
  }
  saveDb(db);
  write({ done: true, sent, failed, skipped, doneCount: total, total });
  res.end();
});

export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Bushra Tech leads → http://localhost:${PORT}`);
    if (!KEY) console.log("Missing GOOGLE_MAPS_API_KEY in .env");
    if (!mailReady()) console.log("Missing SMTP_USER / SMTP_PASS in .env");
  });
}
