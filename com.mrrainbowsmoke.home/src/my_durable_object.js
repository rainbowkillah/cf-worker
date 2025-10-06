export class MyDurableObject {
  constructor(state, env) {
    this.state = state
    this.env = env
    // initialize counter if not present
    this._initPromise = this.state.storage.get('count').then(v => {
      if (v === undefined || v === null) return this.state.storage.put('count', 0)
    })
  }

  async fetch(request) {
    await this._initPromise
    const url = new URL(request.url)
    if (request.method === 'POST') {
      // increment
      const delta = parseInt(await request.text() || '1', 10) || 1
      const current = (await this.state.storage.get('count')) || 0
      const next = current + delta
      await this.state.storage.put('count', next)
      return new Response(JSON.stringify({ count: next }), { headers: { 'content-type': 'application/json' } })
    }

    // GET: return current count
    const current = (await this.state.storage.get('count')) || 0
    return new Response(JSON.stringify({ count: current }), { headers: { 'content-type': 'application/json' } })
  }
}
