// Stubs for rendering the real popup outside Chrome with sample data.
// Used only to produce store screenshots; never shipped.
(() => {
  const mode = new URLSearchParams(location.search).get("mode") || "main";
  const store = mode === "main" ? { access_token: "a.b.c", refresh_token: "d.e.f" } : {};
  window.chrome = {
    storage: { local: {
      get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => k in store).map((k) => [k, store[k]])),
      set: async (items) => Object.assign(store, items),
      remove: async (keys) => [].concat(keys).forEach((k) => delete store[k]),
    } },
    tabs: { query: async () => [{ id: 1, url: "https://www.linkedin.com/in/sample-profile/" }], create: () => {} },
    scripting: { executeScript: async () => [{ result: { isLinkedInProfile: true, name: "Maya Chen", role: "Engineering Manager", company: "Northwind Labs" } }] },
  };
  window.fetch = async () => new Response(JSON.stringify({
    message: "Hi Maya, I enjoyed your talk on scaling frontend teams at Northwind Labs. I lead a React platform team and would love to connect and swap notes on developer experience.",
  }), { status: 200, headers: { "Content-Type": "application/json" } });
})();
