import { MyDurableObject } from './my_durable_object'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    // API paths for examples
    if (url.pathname === '/_kv') return kvExample(env)
    if (url.pathname === '/_d1') return d1Example(env)
    if (url.pathname === '/_r2') return r2Example(env)
    if (url.pathname === '/_do') return doExample(request, env)
    // Simple virtual chat agent API
    // Forward chat/admin API to Durable Object binding if present
    if (url.pathname.startsWith('/api/')) return forwardToDO(request, env)
    if (url.pathname === '/admin') return adminPage()

    return landingPage()
  }
}

async function kvExample(env) {
  const kv = env.home_kv || env.MY_KV
  if (!kv) return new Response('KV binding not configured', { status: 404 })
  try {
    const val = await kv.get('visitor_count')
    return new Response(JSON.stringify({ visitor_count: val || 0 }), { headers: { 'content-type': 'application/json' } })
  } catch (e) {
    return new Response('Error reading KV: ' + String(e), { status: 500 })
  }
}

async function d1Example(env) {
  const db = env.home_db
  if (!db) return new Response('D1 binding `home_db` not configured', { status: 404 })
  try {
    const res = await db.prepare('SELECT 1 as ok').all()
    return new Response(JSON.stringify(res.results), { headers: { 'content-type': 'application/json' } })
  } catch (e) {
    return new Response('Error querying D1: ' + String(e), { status: 500 })
  }
}

async function r2Example(env) {
  const r2 = env.home_r2
  if (!r2) return new Response('R2 binding `home_r2` not configured', { status: 404 })
  try {
    const list = await r2.list()
    return new Response(JSON.stringify({ objects: list.objects || [] }), { headers: { 'content-type': 'application/json' } })
  } catch (e) {
    return new Response('Error listing R2: ' + String(e), { status: 500 })
  }
}

async function doExample(request, env) {
  const DO = env.MY_DO_CLASS
  if (!DO) return new Response('Durable Object binding `MY_DO_CLASS` not configured', { status: 404 })
  try {
    const id = DO.idFromName('global-counter')
    const stub = DO.get(id)
    const resp = await stub.fetch(request)
    return resp
  } catch (e) {
    return new Response('Error calling Durable Object: ' + String(e), { status: 500 })
  }
}

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
    </script>
  </head>
  <body>
    <div class="card">
      <header>
        <div class="logo">RB</div>
        <div>
          <h1>home.mrrainbowsmoke.com — front door</h1>
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
        <div>Bindings examples: <a class="small" href="/_kv">KV</a> · <a class="small" href="/_d1">D1</a> · <a class="small" href="/_r2">R2</a> · <a class="small" href="/_do">DO</a></div>
      </footer>
    </div>
  </body>
</html>`

  return new Response(html, {
    headers: { 'content-type': 'text/html;charset=UTF-8' }
  })
}

async function forwardToDO(request, env){
  const DO = env.MY_DO_CLASS
  if (!DO) {
    // No durable object bound - fall back to in-worker handler
    if (request.method === 'POST' && new URL(request.url).pathname === '/api/chat') return chatHandler(request)
    return new Response('Durable Object binding `MY_DO_CLASS` not configured', { status: 502 })
  }

  const id = DO.idFromName('global-chat')
  const stub = DO.get(id)
  // Rewrite the URL path to remove /api prefix so DO sees '/chat' or '/links'
  const url = new URL(request.url)
  const newPath = url.pathname.replace(/^\/api/, '') || '/'
  // Use a dummy origin so the DO's `new URL(request.url)` can parse it correctly in local runtime
  const origin = url.origin || 'http://localhost:8787'
  const proxiedUrl = origin + newPath + url.search
  const proxied = new Request(proxiedUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'manual'
  })
  return stub.fetch(proxied)
}

function adminPage(){
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
    </script>
  </body>
</html>`
  return new Response(html, { headers: { 'content-type': 'text/html;charset=UTF-8' } })
}

// Single in-worker chat fallback
async function chatHandler(request){
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { 'content-type': 'application/json' } })
  const text = (await request.text()).trim().toLowerCase()
  let reply = "I'm not sure how to help with that. Try asking for 'domains', 'links', or 'help'."

  if (!text) reply = 'Say something and I will try to help.'
  else if (text.includes('domain')) reply = 'Primary domains: https://mrrainbowsmoke.com, https://blog.mrrainbowsmoke.com, https://projects.mrrainbowsmoke.com.'
  else if (text.includes('links') || text.includes('link')) reply = 'Try: /, https://mrrainbowsmoke.com, https://github.com/rainbowkillah'
  else if (text.includes('hello') || text.includes('hi') || text.includes('hey')) reply = 'Hi! I can list domains or give a short description. Ask: "What domains do you have?"'
  else if (text.includes('help')) reply = 'You can ask: "What domains do you have?", "Where is your blog?", or "Who are you?"'
  else if (text.includes('who') || text.includes('you')) reply = 'I am a tiny virtual assistant running inside this Cloudflare Worker. I can show links and basic info.'

  return new Response(JSON.stringify({ reply }), { headers: { 'content-type': 'application/json' } })
}

// Re-export Durable Object class so Wrangler can bind it by class name
export { MyDurableObject }
