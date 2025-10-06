export class MyDurableObject {
  constructor(state, env) {
    this.state = state
    this.env = env
    this._initPromise = this._ensureDefaults()
  }

  async _ensureDefaults() {
    const existing = await this.state.storage.get('links')
    if (!existing) {
      const defaults = [
        { title: 'Home', url: 'https://mrrainbowsmoke.com', slug: 'home', desc: 'Primary domain' },
        { title: 'Home2', url: 'https://rainbowsmokeofficial.com', slug: 'blog', desc: 'Blog and posts' },
        { title: 'Projects', url: 'https://projects.mrrainbowsmoke.com', slug: 'projects', desc: 'Projects and experiments' }
      ]
      await this.state.storage.put('links', defaults)
    }
    // conversations map: conversations:{sessionId} -> [{role,msg,ts}]
    // rate limiting map handled per session key
  }

  async fetch(request) {
    await this._initPromise
    const url = new URL(request.url)
    const pathname = url.pathname || '/'

    // Links API
    if (pathname === '/links' && request.method === 'GET') return this._getLinks()
    if (pathname === '/links' && request.method === 'POST') return this._requireAdmin(request, () => this._addLink(request))
    if (pathname.startsWith('/links/') && request.method === 'DELETE') return this._requireAdmin(request, () => this._deleteLink(pathname.split('/').pop()))

    // Verification endpoint for Microsoft Verified ID
    if (pathname === '/verify' && request.method === 'POST') return this._verifyPresentation(request)

    // Chat API
    if (pathname === '/chat' && (request.method === 'POST' || request.method === 'GET')) return this._chatHandler(request)

    return new Response('Not found', { status: 404 })
  }

  async _getLinks() {
    const links = (await this.state.storage.get('links')) || []
    return new Response(JSON.stringify(links), { headers: { 'content-type': 'application/json' } })
  }

  // Admin session helper - executes fn if admin token valid
  async _requireAdmin(request, fn) {
    try {
      const auth = request.headers.get('authorization') || request.headers.get('x-admin-token')
      if (!auth) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } })
      const token = auth.replace(/^Bearer\s+/i, '')
      const key = `admin:${token}`
      const info = await this.state.storage.get(key)
      if (!info || !info.expires || Date.now() > info.expires) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } })
      // token valid - run the provided function
      return await fn()
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
    }
  }

  async _addLink(request) {
    try {
      const body = await request.json()
      if (!body || !body.url || !body.title) return new Response('Missing title or url', { status: 400 })
      const slug = body.slug || this._slugify(body.title)
      const links = (await this.state.storage.get('links')) || []
      // replace if slug exists
      const filtered = links.filter(l => l.slug !== slug)
      filtered.push({ title: body.title, url: body.url, slug, desc: body.desc || '' })
      await this.state.storage.put('links', filtered)
      return new Response(JSON.stringify({ ok: true, slug }), { headers: { 'content-type': 'application/json' } })
    } catch (e) {
      return new Response(String(e), { status: 500 })
    }
  }

  async _deleteLink(slug) {
    const links = (await this.state.storage.get('links')) || []
    const filtered = links.filter(l => l.slug !== slug)
    await this.state.storage.put('links', filtered)
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
  }

  _slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }

  // Verify a Verifiable Presentation via Microsoft Verified ID (if configured)
  async _verifyPresentation(request) {
    try {
      const bodyText = await request.text()
      const verifyUrl = this.env.MS_VC_VERIFY_URL
      if (!verifyUrl) return new Response(JSON.stringify({ error: 'verification_not_configured' }), { status: 501, headers: { 'content-type': 'application/json' } })

      // Acquire bearer token: prefer client credentials if configured
      let bearer = this.env.MS_VC_API_KEY || ''
      if (!bearer && this.env.MS_VC_CLIENT_ID && this.env.MS_VC_CLIENT_SECRET && this.env.MS_TENANT_ID) {
        const tokenRes = await fetch(`https://login.microsoftonline.com/${this.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: this.env.MS_VC_CLIENT_ID,
            client_secret: this.env.MS_VC_CLIENT_SECRET,
            grant_type: 'client_credentials',
            scope: this.env.MS_VC_SCOPE || 'https://verifiedid.did.msidentity.com/.default'
          }).toString()
        })
        if (!tokenRes.ok) {
          const txt = await tokenRes.text()
          return new Response(JSON.stringify({ error: 'oauth_failed', status: tokenRes.status, body: txt }), { status: 502, headers: { 'content-type': 'application/json' } })
        }
        const tokenJson = await tokenRes.json()
        bearer = tokenJson.access_token
      }

      if (!bearer) return new Response(JSON.stringify({ error: 'no_verifier_auth' }), { status: 403, headers: { 'content-type': 'application/json' } })

      // Post presentation to Microsoft verify endpoint
      const verifyRes = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${bearer}` },
        body: bodyText
      })

      if (!verifyRes.ok) {
        const txt = await verifyRes.text()
        return new Response(JSON.stringify({ ok: false, status: verifyRes.status, body: txt }), { status: 400, headers: { 'content-type': 'application/json' } })
      }

      const j = await verifyRes.json()

      // Microsoft response shapes vary; check common success indicators and errors
      const hasErrors = Array.isArray(j.errors) && j.errors.length > 0
      const successFlags = [j.verificationResult, j.status, j.isValid, j.result?.isValid]
      const isSuccess = !hasErrors && successFlags.some(f => f === 'Success' || f === 'success' || f === true)
      if (!isSuccess) return new Response(JSON.stringify({ ok: false, result: j }), { status: 400, headers: { 'content-type': 'application/json' } })

      // Extract verifiable credential(s)
      const vcs = j.verifiableCredential || j.result?.verifiableCredential || j.verifiableCredentials || j.result?.verifiableCredentials || []
      const firstVC = (Array.isArray(vcs) && vcs[0]) || null

      // Allow config for claim path to check admin rights: e.g. 'credentialSubject.role' or 'credentialSubject.admin'
      const claimPath = (this.env.ADMIN_CLAIM_PATH || 'credentialSubject.role')
      let claimValue = null
      if (firstVC) {
        // simple dot-path resolver
        const parts = claimPath.split('.')
        let cur = firstVC
        for (const p of parts) {
          if (cur == null) { cur = null; break }
          cur = cur[p]
        }
        claimValue = cur
      }

      // Admin policy: either ADMIN_CLAIM_VALUE matches or credentialSubject.admin === true
      const requiredClaimVal = this.env.ADMIN_CLAIM_VALUE || 'admin'
      const isAdmin = (claimValue === requiredClaimVal) || (firstVC?.credentialSubject && (firstVC.credentialSubject.admin === true || firstVC.credentialSubject.role === requiredClaimVal))
      if (!isAdmin) return new Response(JSON.stringify({ ok: false, reason: 'not_admin', result: j }), { status: 403, headers: { 'content-type': 'application/json' } })

      // Issue admin token
      const token = crypto.randomUUID()
      const ttlMs = parseInt(this.env.ADMIN_SESSION_TTL_MS || '900000', 10) || 15 * 60 * 1000
      const info = { created: Date.now(), expires: Date.now() + ttlMs, verified: { issuer: firstVC?.issuer || firstVC?.iss, claimPath, claimValue } }
      await this.state.storage.put(`admin:${token}`, info)
      return new Response(JSON.stringify({ ok: true, token, expires: info.expires }), { headers: { 'content-type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'content-type': 'application/json' } })
    }
  }

  // Rate limiter: allow up to `limit` messages per `windowMs` per session
  async _checkRateLimit(sessionId, limit = 5, windowMs = 60_000) {
    const key = `rate:${sessionId}`
    const now = Date.now()
    const val = (await this.state.storage.get(key)) || { count: 0, start: now }
    if (now - val.start > windowMs) {
      // reset
      await this.state.storage.put(key, { count: 1, start: now })
      return { ok: true }
    }
    if (val.count >= limit) return { ok: false, retryAfter: Math.ceil((val.start + windowMs - now) / 1000) }
    val.count = val.count + 1
    await this.state.storage.put(key, val)
    return { ok: true }
  }

  async _chatHandler(request) {
    // support GET for simple health
    if (request.method === 'GET') return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })

    try {
      const text = (await request.text()).trim()
      // session id passed in header X-Session-Id or query param
      const url = new URL(request.url)
      let sessionId = request.headers.get('x-session-id') || url.searchParams.get('sid')
      if (!sessionId) {
        sessionId = crypto.randomUUID()
      }

      // rate limit
      const rl = await this._checkRateLimit(sessionId)
      if (!rl.ok) return new Response(JSON.stringify({ error: 'rate_limited', retry_after: rl.retryAfter }), { status: 429, headers: { 'content-type': 'application/json' } })

      // store message
      const convKey = `convo:${sessionId}`
      const conv = (await this.state.storage.get(convKey)) || []
      conv.push({ role: 'user', text, ts: Date.now() })

      // determine whether to use external LLM
      const OPENAI_KEY = this.env.OPENAI_API_KEY
      let reply = ''
      if (OPENAI_KEY) {
        // build a small prompt from last 6 messages
        const history = conv.slice(-6).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))
        try {
          const model = this.env.OPENAI_MODEL || 'gpt-3.5-turbo'
          const payload = { model, messages: history }
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'authorization': `Bearer ${OPENAI_KEY}` },
            body: JSON.stringify(payload)
          })
          if (res.ok) {
            const j = await res.json()
            reply = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content ? j.choices[0].message.content.trim() : ''
          } else {
            reply = `LLM error: ${res.status}`
          }
        } catch (e) {
          reply = 'LLM request failed'
        }
      }

      // fallback rule-based reply if LLM not configured or returned nothing
      if (!reply) {
        const t = text.toLowerCase()
        if (!t) reply = 'Say something and I will try to help.'
        else if (t.includes('domain')) reply = 'Primary domains: https://mrrainbowsmoke.com, https://blog.mrrainbowsmoke.com, https://projects.mrrainbowsmoke.com.'
        else if (t.includes('links') || t.includes('link')) reply = 'Try: /, https://mrrainbowsmoke.com, https://github.com/rainbowkillah'
        else if (t.includes('hello') || t.includes('hi') || t.includes('hey')) reply = 'Hi! I can list domains or give a short description. Ask: "What domains do you have?"'
        else if (t.includes('help')) reply = 'You can ask: "What domains do you have?", "Where is your blog?", or "Who are you?"'
        else if (t.includes('who') || t.includes('you')) reply = 'I am a tiny virtual assistant running inside this Cloudflare Worker. I can show links and basic info.'
        else reply = "I'm not sure how to help with that. Try asking for 'domains', 'links', or 'help'."
      }

      conv.push({ role: 'bot', text: reply, ts: Date.now() })
      await this.state.storage.put(convKey, conv)

      return new Response(JSON.stringify({ reply, sessionId }), { headers: { 'content-type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'content-type': 'application/json' } })
    }
  }
}
