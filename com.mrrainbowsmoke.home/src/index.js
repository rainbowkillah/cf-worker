import { MyDurableObject } from './my_durable_object'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    // API paths for examples
    if (url.pathname === '/_kv') return kvExample(env)
    if (url.pathname === '/_d1') return d1Example(env)
    if (url.pathname === '/_r2') return r2Example(env)
    if (url.pathname === '/_do') return doExample(request, env)

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
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:linear-gradient(135deg,#0f172a,#001219);color:#e6f0ff}
      .card{max-width:880px;padding:48px;border-radius:12px;background:rgba(255,255,255,0.04);box-shadow:0 10px 30px rgba(2,6,23,0.6);} 
      h1{margin:0 0 8px;font-size:clamp(24px,4vw,40px)}
      p{margin:0 0 12px;opacity:0.9}
      a{color:#7ee787}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>home.mrrainbowsmoke.com</h1>
      <p>Hello — I'm running a Cloudflare Worker as my landing page.</p>
      <p>Quick links:</p>
      <ul>
        <li><a href="https://github.com/rainbowkillah">GitHub</a></li>
        <li><a href="https://twitter.com/">Twitter</a> (optional)</li>
      </ul>
      <p style="opacity:0.8;font-size:0.9em;margin-top:12px">Powered by Cloudflare Workers — deployed with <code>wrangler</code>.</p>
      <p style="font-size:0.9em;margin-top:12px">Bindings examples: <a href="/_kv">KV</a> · <a href="/_d1">D1</a> · <a href="/_r2">R2</a> · <a href="/_do">Durable Object</a></p>
    </div>
  </body>
</html>`

  return new Response(html, {
    headers: { 'content-type': 'text/html;charset=UTF-8' }
  })
}

// Re-export Durable Object class so Wrangler can bind it by class name
export { MyDurableObject }
