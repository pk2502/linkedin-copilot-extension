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
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  window.fetch = async (url) => {
    const path = new URL(url).pathname;
    if (path === "/api/profile/") return reply({ completeness: 80 });
    if (path.endsWith("/tweak/")) {
      return reply({ id: 2, text: "Hi Maya, I lead a React platform team and enjoyed your talk on scaling frontend teams. Would love to connect." }, 201);
    }
    return reply({
      id: 1,
      variants: [
        "Hi Maya, I lead a React platform team and your talk on scaling frontend teams at Northwind Labs hit close to home. Would be glad to connect and swap notes on developer experience.",
        "Hi Maya, your work growing the engineering org at Northwind Labs caught my attention. I build frontend platforms and would value being connected.",
        "Hi Maya - React platform lead here. Would like to connect and follow your work at Northwind Labs.",
      ],
    }, 201);
  };
})();
