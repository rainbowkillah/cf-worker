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
    this._initPromise = this.state.storage.get("count").then((v) => {
      if (v === void 0 || v === null) return this.state.storage.put("count", 0);
    });
  }
  async fetch(request) {
    await this._initPromise;
    const url = new URL(request.url);
    if (request.method === "POST") {
      const delta = parseInt(await request.text() || "1", 10) || 1;
      const current2 = await this.state.storage.get("count") || 0;
      const next = current2 + delta;
      await this.state.storage.put("count", next);
      return new Response(JSON.stringify({ count: next }), { headers: { "content-type": "application/json" } });
    }
    const current = await this.state.storage.get("count") || 0;
    return new Response(JSON.stringify({ count: current }), { headers: { "content-type": "application/json" } });
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
      <p>Hello \u2014 I'm running a Cloudflare Worker as my landing page.</p>
      <p>Quick links:</p>
      <ul>
        <li><a href="https://github.com/rainbowkillah">GitHub</a></li>
        <li><a href="https://twitter.com/">Twitter</a> (optional)</li>
      </ul>
      <p style="opacity:0.8;font-size:0.9em;margin-top:12px">Powered by Cloudflare Workers \u2014 deployed with <code>wrangler</code>.</p>
      <p style="font-size:0.9em;margin-top:12px">Bindings examples: <a href="/_kv">KV</a> \xB7 <a href="/_d1">D1</a> \xB7 <a href="/_r2">R2</a> \xB7 <a href="/_do">Durable Object</a></p>
    </div>
  </body>
</html>`;
  return new Response(html, {
    headers: { "content-type": "text/html;charset=UTF-8" }
  });
}
__name(landingPage, "landingPage");

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

// .wrangler/tmp/bundle-stUgs7/middleware-insertion-facade.js
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

// .wrangler/tmp/bundle-stUgs7/middleware-loader.entry.ts
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
