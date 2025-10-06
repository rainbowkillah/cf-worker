var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/my_durable_object.js
var MyDurableObject = class {
  static {
    __name(this, "MyDurableObject");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this._initPromise = this._ensureDefaults();
  }
  async _ensureDefaults() {
    const existing = await this.state.storage.get("links");
    if (!existing) {
      const defaults = [
        { title: "Home", url: "https://mrrainbowsmoke.com", slug: "home", desc: "Primary domain" },
        { title: "Blog", url: "https://blog.mrrainbowsmoke.com", slug: "blog", desc: "Blog and posts" },
        { title: "Projects", url: "https://projects.mrrainbowsmoke.com", slug: "projects", desc: "Projects and experiments" }
      ];
      await this.state.storage.put("links", defaults);
    }
  }
  async fetch(request) {
    await this._initPromise;
    const url = new URL(request.url);
    const pathname = url.pathname || "/";
    if (pathname === "/links" && request.method === "GET") return this._getLinks();
    if (pathname === "/links" && request.method === "POST") return this._requireAdmin(request, () => this._addLink(request));
    if (pathname.startsWith("/links/") && request.method === "DELETE") return this._requireAdmin(request, () => this._deleteLink(pathname.split("/").pop()));
    if (pathname === "/verify" && request.method === "POST") return this._verifyPresentation(request);
    if (pathname === "/chat" && (request.method === "POST" || request.method === "GET")) return this._chatHandler(request);
    return new Response("Not found", { status: 404 });
  }
  async _getLinks() {
    const links = await this.state.storage.get("links") || [];
    return new Response(JSON.stringify(links), { headers: { "content-type": "application/json" } });
  }
  // Admin session helper - executes fn if admin token valid
  async _requireAdmin(request, fn) {
    try {
      const auth = request.headers.get("authorization") || request.headers.get("x-admin-token");
      if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
      const token = auth.replace(/^Bearer\s+/i, "");
      const key = `admin:${token}`;
      const info = await this.state.storage.get(key);
      if (!info || !info.expires || Date.now() > info.expires) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
      return await fn();
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
    }
  }
  async _addLink(request) {
    try {
      const body = await request.json();
      if (!body || !body.url || !body.title) return new Response("Missing title or url", { status: 400 });
      const slug = body.slug || this._slugify(body.title);
      const links = await this.state.storage.get("links") || [];
      const filtered = links.filter((l) => l.slug !== slug);
      filtered.push({ title: body.title, url: body.url, slug, desc: body.desc || "" });
      await this.state.storage.put("links", filtered);
      return new Response(JSON.stringify({ ok: true, slug }), { headers: { "content-type": "application/json" } });
    } catch (e) {
      return new Response(String(e), { status: 500 });
    }
  }
  async _deleteLink(slug) {
    const links = await this.state.storage.get("links") || [];
    const filtered = links.filter((l) => l.slug !== slug);
    await this.state.storage.put("links", filtered);
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  }
  _slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }
  // Verify a Verifiable Presentation via Microsoft Verified ID (if configured)
  async _verifyPresentation(request) {
    try {
      const bodyText = await request.text();
      const verifyUrl = this.env.MS_VC_VERIFY_URL;
      if (!verifyUrl) return new Response(JSON.stringify({ error: "verification_not_configured" }), { status: 501, headers: { "content-type": "application/json" } });
      let bearer = this.env.MS_VC_API_KEY || "";
      if (!bearer && this.env.MS_VC_CLIENT_ID && this.env.MS_VC_CLIENT_SECRET && this.env.MS_TENANT_ID) {
        const tokenRes = await fetch(`https://login.microsoftonline.com/${this.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: this.env.MS_VC_CLIENT_ID,
            client_secret: this.env.MS_VC_CLIENT_SECRET,
            grant_type: "client_credentials",
            scope: this.env.MS_VC_SCOPE || "https://verifiedid.did.msidentity.com/.default"
          }).toString()
        });
        if (!tokenRes.ok) {
          const txt = await tokenRes.text();
          return new Response(JSON.stringify({ error: "oauth_failed", status: tokenRes.status, body: txt }), { status: 502, headers: { "content-type": "application/json" } });
        }
        const tokenJson = await tokenRes.json();
        bearer = tokenJson.access_token;
      }
      if (!bearer) return new Response(JSON.stringify({ error: "no_verifier_auth" }), { status: 403, headers: { "content-type": "application/json" } });
      const verifyRes = await fetch(verifyUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": `Bearer ${bearer}` },
        body: bodyText
      });
      if (!verifyRes.ok) {
        const txt = await verifyRes.text();
        return new Response(JSON.stringify({ ok: false, status: verifyRes.status, body: txt }), { status: 400, headers: { "content-type": "application/json" } });
      }
      const j = await verifyRes.json();
      const hasErrors = Array.isArray(j.errors) && j.errors.length > 0;
      const successFlags = [j.verificationResult, j.status, j.isValid, j.result?.isValid];
      const isSuccess = !hasErrors && successFlags.some((f) => f === "Success" || f === "success" || f === true);
      if (!isSuccess) return new Response(JSON.stringify({ ok: false, result: j }), { status: 400, headers: { "content-type": "application/json" } });
      const vcs = j.verifiableCredential || j.result?.verifiableCredential || j.verifiableCredentials || j.result?.verifiableCredentials || [];
      const firstVC = Array.isArray(vcs) && vcs[0] || null;
      const claimPath = this.env.ADMIN_CLAIM_PATH || "credentialSubject.role";
      let claimValue = null;
      if (firstVC) {
        const parts = claimPath.split(".");
        let cur = firstVC;
        for (const p of parts) {
          if (cur == null) {
            cur = null;
            break;
          }
          cur = cur[p];
        }
        claimValue = cur;
      }
      const requiredClaimVal = this.env.ADMIN_CLAIM_VALUE || "admin";
      const isAdmin = claimValue === requiredClaimVal || firstVC?.credentialSubject && (firstVC.credentialSubject.admin === true || firstVC.credentialSubject.role === requiredClaimVal);
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, reason: "not_admin", result: j }), { status: 403, headers: { "content-type": "application/json" } });
      const token = crypto.randomUUID();
      const ttlMs = parseInt(this.env.ADMIN_SESSION_TTL_MS || "900000", 10) || 15 * 60 * 1e3;
      const info = { created: Date.now(), expires: Date.now() + ttlMs, verified: { issuer: firstVC?.issuer || firstVC?.iss, claimPath, claimValue } };
      await this.state.storage.put(`admin:${token}`, info);
      return new Response(JSON.stringify({ ok: true, token, expires: info.expires }), { headers: { "content-type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "content-type": "application/json" } });
    }
  }
  // Rate limiter: allow up to `limit` messages per `windowMs` per session
  async _checkRateLimit(sessionId, limit = 5, windowMs = 6e4) {
    const key = `rate:${sessionId}`;
    const now = Date.now();
    const val = await this.state.storage.get(key) || { count: 0, start: now };
    if (now - val.start > windowMs) {
      await this.state.storage.put(key, { count: 1, start: now });
      return { ok: true };
    }
    if (val.count >= limit) return { ok: false, retryAfter: Math.ceil((val.start + windowMs - now) / 1e3) };
    val.count = val.count + 1;
    await this.state.storage.put(key, val);
    return { ok: true };
  }
  async _chatHandler(request) {
    if (request.method === "GET") return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
    try {
      const text = (await request.text()).trim();
      const url = new URL(request.url);
      let sessionId = request.headers.get("x-session-id") || url.searchParams.get("sid");
      if (!sessionId) {
        sessionId = crypto.randomUUID();
      }
      const rl = await this._checkRateLimit(sessionId);
      if (!rl.ok) return new Response(JSON.stringify({ error: "rate_limited", retry_after: rl.retryAfter }), { status: 429, headers: { "content-type": "application/json" } });
      const convKey = `convo:${sessionId}`;
      const conv = await this.state.storage.get(convKey) || [];
      conv.push({ role: "user", text, ts: Date.now() });
      const OPENAI_KEY = this.env.OPENAI_API_KEY;
      let reply = "";
      if (OPENAI_KEY) {
        const history = conv.slice(-6).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
        try {
          const model = this.env.OPENAI_MODEL || "gpt-3.5-turbo";
          const payload = { model, messages: history };
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "content-type": "application/json", "authorization": `Bearer ${OPENAI_KEY}` },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            const j = await res.json();
            reply = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content ? j.choices[0].message.content.trim() : "";
          } else {
            reply = `LLM error: ${res.status}`;
          }
        } catch (e) {
          reply = "LLM request failed";
        }
      }
      if (!reply) {
        const t = text.toLowerCase();
        if (!t) reply = "Say something and I will try to help.";
        else if (t.includes("domain")) reply = "Primary domains: https://mrrainbowsmoke.com, https://blog.mrrainbowsmoke.com, https://projects.mrrainbowsmoke.com.";
        else if (t.includes("links") || t.includes("link")) reply = "Try: /, https://mrrainbowsmoke.com, https://github.com/rainbowkillah";
        else if (t.includes("hello") || t.includes("hi") || t.includes("hey")) reply = 'Hi! I can list domains or give a short description. Ask: "What domains do you have?"';
        else if (t.includes("help")) reply = 'You can ask: "What domains do you have?", "Where is your blog?", or "Who are you?"';
        else if (t.includes("who") || t.includes("you")) reply = "I am a tiny virtual assistant running inside this Cloudflare Worker. I can show links and basic info.";
        else reply = "I'm not sure how to help with that. Try asking for 'domains', 'links', or 'help'.";
      }
      conv.push({ role: "bot", text: reply, ts: Date.now() });
      await this.state.storage.put(convKey, conv);
      return new Response(JSON.stringify({ reply, sessionId }), { headers: { "content-type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "content-type": "application/json" } });
    }
  }
};

// src/index.js
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/_kv") return kvExample(env);
    if (url.pathname === "/_d1") return d1Example(env);
    if (url.pathname === "/_r2") return r2Example(env);
    if (url.pathname === "/_do") return doExample(request, env);
    if (url.pathname.startsWith("/api/")) return forwardToDO(request, env);
    if (url.pathname === "/admin") return adminPage();
    return landingPage();
  }
};
async function kvExample(env) {
  const kv = env.home_kv || env.MY_KV;
  if (!kv) return new Response("KV binding not configured", { status: 404 });
  try {
    const val = await kv.get("visitor_count");
    return new Response(JSON.stringify({ visitor_count: val || 0 }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response("Error reading KV: " + String(e), { status: 500 });
  }
}
__name(kvExample, "kvExample");
async function d1Example(env) {
  const db = env.home_db;
  if (!db) return new Response("D1 binding `home_db` not configured", { status: 404 });
  try {
    const res = await db.prepare("SELECT 1 as ok").all();
    return new Response(JSON.stringify(res.results), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response("Error querying D1: " + String(e), { status: 500 });
  }
}
__name(d1Example, "d1Example");
async function r2Example(env) {
  const r2 = env.home_r2;
  if (!r2) return new Response("R2 binding `home_r2` not configured", { status: 404 });
  try {
    const list = await r2.list();
    return new Response(JSON.stringify({ objects: list.objects || [] }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response("Error listing R2: " + String(e), { status: 500 });
  }
}
__name(r2Example, "r2Example");
async function doExample(request, env) {
  const DO = env.MY_DO_CLASS;
  if (!DO) return new Response("Durable Object binding `MY_DO_CLASS` not configured", { status: 404 });
  try {
    const id = DO.idFromName("global-counter");
    const stub = DO.get(id);
    const resp = await stub.fetch(request);
    return resp;
  } catch (e) {
    return new Response("Error calling Durable Object: " + String(e), { status: 500 });
  }
}
__name(doExample, "doExample");
function landingPage() {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>home.mrrainbowsmoke.com</title>
    <style>
      :root{
        --bg:#050505;
        --card:rgba(255,255,255,0.04);
      }
      html,body{height:100%;margin:0}
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:linear-gradient(120deg,#0f0c29,#302b63,#24243e);display:flex;align-items:center;justify-content:center;color:#fff}
      .card{width:min(920px,94%);padding:36px;border-radius:16px;background:var(--card);backdrop-filter:blur(6px);box-shadow:0 10px 40px rgba(2,6,23,0.6);border:1px solid rgba(255,255,255,0.04)}
      header{display:flex;align-items:center;gap:16px}
      .logo{width:64px;height:64px;border-radius:12px;background:linear-gradient(90deg,#ff3cac,#784ba0,#2b86c5,#00f5a0);box-shadow:0 6px 18px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;font-weight:700}
      h1{margin:0;font-size:clamp(20px,3.4vw,36px)}
      p.lead{margin:8px 0 18px;opacity:0.95}
      nav a{color:transparent;background:linear-gradient(90deg,#ff3cac,#ff8a00,#fecd1a,#2b86c5,#7effc1);-webkit-background-clip:text;background-clip:text;text-decoration:none;font-weight:600;margin-right:16px}
      .cols{display:flex;gap:20px;margin-top:20px}
      .left{flex:1}
      .right{width:320px}
      .card-panel{background:rgba(255,255,255,0.02);padding:14px;border-radius:10px}
      .chat{display:flex;flex-direction:column;height:360px}
      .messages{flex:1;overflow:auto;padding:8px;display:flex;flex-direction:column;gap:8px}
      .msg{padding:8px 12px;border-radius:12px;max-width:80%}
      .msg.user{align-self:flex-end;background:linear-gradient(90deg,#7effc1,#2b86c5);color:#042}
      .msg.bot{align-self:flex-start;background:rgba(255,255,255,0.06);color:#fff}
      .input-row{display:flex;gap:8px;margin-top:8px}
      .input-row input{flex:1;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:#fff}
      .input-row button{padding:10px 12px;border-radius:10px;border:none;background:linear-gradient(90deg,#ff3cac,#784ba0);color:#fff;font-weight:600}
      footer{margin-top:16px;font-size:0.9em;opacity:0.85}
      a.small{color:#9be7ff}
    </style>
    <script>
      async function sendMessage(e){
        e && e.preventDefault()
        const input = document.getElementById('chat-input')
        const text = input.value.trim()
        if(!text) return
        appendMessage('user', text)
        input.value=''
        try{
          const res = await fetch('/api/chat', {method:'POST', body: text})
          const data = await res.json()
          appendMessage('bot', data.reply)
        }catch(err){
          appendMessage('bot', 'Sorry, the chat agent is unavailable.')
        }
      }
      function appendMessage(kind, text){
        const cont = document.querySelector('.messages')
        const el = document.createElement('div')
        el.className = 'msg '+(kind==='user'?'user':'bot')
        el.textContent = text
        cont.appendChild(el)
        cont.scrollTop = cont.scrollHeight
      }
      // sample greeting
      window.addEventListener('DOMContentLoaded', ()=>{
        appendMessage('bot','Welcome! I can help you navigate the domains and answer simple questions. Try: "What domains do you have?"')
      })
    <\/script>
  </head>
  <body>
    <div class="card">
      <header>
        <div class="logo">RB</div>
        <div>
          <h1>home.mrrainbowsmoke.com \u2014 front door</h1>
          <div class="lead">A colorful gateway to the main domains. Use the chat on the right to ask for links or info.</div>
          <nav>
            <a href="https://mrrainbowsmoke.com">mrrainbowsmoke.com</a>
            <a href="https://blog.mrrainbowsmoke.com">blog.mrrainbowsmoke.com</a>
            <a href="https://projects.mrrainbowsmoke.com">projects.mrrainbowsmoke.com</a>
          </nav>
        </div>
      </header>

      <div class="cols">
        <div class="left">
          <div class="card-panel">
            <h3>About this front door</h3>
            <p style="margin-top:8px">This Worker serves a lightweight landing page that routes visitors to the primary domains. It also hosts a small, in-worker virtual chat agent for fast suggestions and navigation help.</p>
            <ul style="margin-top:8px">
              <li>Links: quick access to main domains</li>
              <li>Chat: ask for domain info, contact, or a short help</li>
              <li>Privacy: the chat runs server-side in this Worker and only echoes simple rule-based replies (no external services)</li>
            </ul>
          </div>
        </div>

        <aside class="right">
          <div class="card-panel chat">
            <div class="messages"></div>
            <form onsubmit="sendMessage(event)" class="input-row">
              <input id="chat-input" placeholder="Ask the virtual assistant..." autocomplete="off" />
              <button type="submit">Send</button>
            </form>
            <div style="margin-top:8px;font-size:0.8em"><a href="/admin" class="small">Manage links</a></div>
          </div>
        </aside>
      </div>

      <footer>
        <div>Bindings examples: <a class="small" href="/_kv">KV</a> \xB7 <a class="small" href="/_d1">D1</a> \xB7 <a class="small" href="/_r2">R2</a> \xB7 <a class="small" href="/_do">DO</a></div>
      </footer>
    </div>
  </body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html;charset=UTF-8" }
  });
}
__name(landingPage, "landingPage");
async function forwardToDO(request, env) {
  const DO = env.MY_DO_CLASS;
  if (!DO) {
    if (request.method === "POST" && new URL(request.url).pathname === "/api/chat") return chatHandler(request);
    return new Response("Durable Object binding `MY_DO_CLASS` not configured", { status: 502 });
  }
  const id = DO.idFromName("global-chat");
  const stub = DO.get(id);
  const url = new URL(request.url);
  const newPath = url.pathname.replace(/^\/api/, "") || "/";
  const origin = url.origin || "http://localhost:8787";
  const proxiedUrl = origin + newPath + url.search;
  const proxied = new Request(proxiedUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: "manual"
  });
  return stub.fetch(proxied);
}
__name(forwardToDO, "forwardToDO");
function adminPage() {
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Links Admin</title>
    <style>body{font-family:system-ui,Arial;background:#071021;color:#fff;padding:24px} .panel{background:rgba(255,255,255,0.03);padding:12px;border-radius:8px} input,textarea{width:100%;padding:8px;margin-top:6px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);background:transparent;color:#fff}</style>
  </head>
  <body>
    <h1>Links Admin</h1>
    <div class="panel">
      <h3>Admin login (Microsoft Verified ID)</h3>
      <p>Paste your Verifiable Presentation JSON below and click Verify. A short-lived admin session token will be issued on success.</p>
      <textarea id="vp" placeholder='Paste presentation JSON here' rows="6" style="width:100%;background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.06);padding:8px;border-radius:6px"></textarea>
      <div style="margin-top:8px"><button id="verifyBtn">Verify & Sign In</button> <span id="adminStatus" style="margin-left:8px"></span></div>
      <hr style="margin:12px 0">
      <h3>Existing links</h3>
      <ul id="links"></ul>
  <h3>Add / update link</h3>
      <form id="addForm">
        <label>Title<input id="title" required /></label>
        <label>URL<input id="url" required /></label>
        <label>Slug (optional)<input id="slug" /></label>
        <label>Description<textarea id="desc"></textarea></label>
        <button type="submit">Save</button>
      </form>
    </div>
    <script>
      // admin auth helpers
      async function tryLoadAdmin(){
        const token = localStorage.getItem('adminToken')
        if (!token) return document.getElementById('adminStatus').textContent = 'Not signed in'
        document.getElementById('adminStatus').textContent = 'Signed in (token stored)'
      }
      document.getElementById('verifyBtn').addEventListener('click', async ()=>{
        const vp = document.getElementById('vp').value.trim()
        if (!vp) return alert('Paste the presentation JSON first')
        document.getElementById('adminStatus').textContent = 'Verifying...'
        try{
          const res = await fetch('/api/verify', { method: 'POST', headers: {'content-type':'application/json'}, body: vp })
          const j = await res.json()
          if (!res.ok) { document.getElementById('adminStatus').textContent = 'Verify failed'; return alert(JSON.stringify(j)) }
          localStorage.setItem('adminToken', j.token)
          document.getElementById('adminStatus').textContent = 'Signed in'
        }catch(e){ document.getElementById('adminStatus').textContent = 'Verify error'; alert(String(e)) }
      })
      async function load(){
        const res = await fetch('/api/links')
        const links = await res.json()
        const ul = document.getElementById('links')
        ul.innerHTML = ''
        for (const l of links){
          const li = document.createElement('li')
          li.innerHTML = '<strong>'+escapeHtml(l.title)+'</strong> - <a href="'+escapeHtml(l.url)+'" target="_blank">'+escapeHtml(l.url)+'</a> <button data-slug="'+escapeHtml(l.slug)+'">Delete</button>'
          ul.appendChild(li)
        }
        document.querySelectorAll('#links button').forEach(b => b.addEventListener('click', async e=>{
          const slug = e.target.getAttribute('data-slug')
          const token = localStorage.getItem('adminToken')
          await fetch('/api/links/'+slug, { method: 'DELETE', headers: token ? { 'authorization': 'Bearer '+token } : {} })
          load()
        }))
      }
      function escapeHtml (s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
      document.getElementById('addForm').addEventListener('submit', async e=>{
        e.preventDefault()
        const body = { title: document.getElementById('title').value, url: document.getElementById('url').value, slug: document.getElementById('slug').value, desc: document.getElementById('desc').value }
        const token = localStorage.getItem('adminToken')
        await fetch('/api/links', { method: 'POST', headers: Object.assign({'content-type':'application/json'}, token ? { 'authorization': 'Bearer '+token } : {}), body: JSON.stringify(body) })
        document.getElementById('addForm').reset()
        load()
      })
      load()
      tryLoadAdmin()
    <\/script>
  </body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html;charset=UTF-8" } });
}
__name(adminPage, "adminPage");
async function chatHandler(request) {
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { "content-type": "application/json" } });
  const text = (await request.text()).trim().toLowerCase();
  let reply = "I'm not sure how to help with that. Try asking for 'domains', 'links', or 'help'.";
  if (!text) reply = "Say something and I will try to help.";
  else if (text.includes("domain")) reply = "Primary domains: https://mrrainbowsmoke.com, https://blog.mrrainbowsmoke.com, https://projects.mrrainbowsmoke.com.";
  else if (text.includes("links") || text.includes("link")) reply = "Try: /, https://mrrainbowsmoke.com, https://github.com/rainbowkillah";
  else if (text.includes("hello") || text.includes("hi") || text.includes("hey")) reply = 'Hi! I can list domains or give a short description. Ask: "What domains do you have?"';
  else if (text.includes("help")) reply = 'You can ask: "What domains do you have?", "Where is your blog?", or "Who are you?"';
  else if (text.includes("who") || text.includes("you")) reply = "I am a tiny virtual assistant running inside this Cloudflare Worker. I can show links and basic info.";
  return new Response(JSON.stringify({ reply }), { headers: { "content-type": "application/json" } });
}
__name(chatHandler, "chatHandler");

// ../../../usr/local/share/nvm/versions/node/v22.17.0/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../usr/local/share/nvm/versions/node/v22.17.0/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-RRDanZ/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../usr/local/share/nvm/versions/node/v22.17.0/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-RRDanZ/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  MyDurableObject,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
