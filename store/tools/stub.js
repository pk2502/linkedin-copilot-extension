// Stubs for rendering the real popup outside Chrome with sample data.
// Used only to produce store screenshots; never shipped.
(() => {
  const mode = new URLSearchParams(location.search).get("mode") || "main";
  const store = mode === "signin" ? {} : { access_token: "a.b.c", refresh_token: "d.e.f" };
  const area = (data) => ({
    get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => k in data).map((k) => [k, data[k]])),
    set: async (items) => Object.assign(data, items),
    remove: async (keys) => [].concat(keys).forEach((k) => delete data[k]),
  });
  const session = {};
  window.__stores = { local: store, session };
  window.__draftCalls = 0;
  window.chrome = {
    storage: { local: area(store), session: area(session) },
    tabs: {
      query: async () => [{
        id: 1,
        url: mode === "job"
          ? "https://www.linkedin.com/jobs/view/4012345678/"
          : mode === "recruiter" || mode === "thread"
            ? "https://www.linkedin.com/messaging/thread/2-abc123/"
            : "https://www.linkedin.com/in/sample-profile/",
      }],
      create: () => {},
    },
    scripting: {
      executeScript: async ({ func, args }) => {
        const name = func?.name;
        if (name === "readProfileSections") {
          return [{ result: {
            about: "Engineering manager at Northwind Labs. Speaker on scaling frontend teams.",
            experience: "Engineering Manager\nNorthwind Labs\n2022 - Present",
            education: "",
          } }];
        }
        if (name === "readOwnProfile") {
          return [{ result: mode === "own" ? {
            headline: "Lead Full-Stack Engineer",
            about: "I build AI products end to end.",
            experience: "Lead Engineer\nInspira\n2021 - Present",
            education: "Mumbai University",
            skills: "React, Django, TypeScript",
          } : null }];
        }
        if (name === "readConversation") {
          const recruiter = [
            { from: "them", name: "Sam Lee", date: "Oct 14", time: "10:02 AM", text: "Hi Paritosh, we're hiring a Staff Engineer for our platform team. Open to a quick call?" },
            { from: "me", name: "Paritosh K", date: "Oct 14", time: "11:15 AM", text: "Thanks Sam! Could you share the job description?" },
            { from: "them", name: "Sam Lee", date: "Today", time: "9:40 AM", text: "Sure, attached. Remote-friendly. Free Thursday?" },
          ];
          const friend = [
            { from: "them", name: "Maya Chen", date: "Oct 2", time: "6:10 PM", text: "Great meeting you at React Conf! Let's stay in touch." },
            { from: "me", name: "Paritosh K", date: "Oct 3", time: "9:00 AM", text: "Likewise Maya, loved your talk on design systems." },
          ];
          if (mode === "recruiter") return [{ result: { name: "Sam Lee", headline: "Technical Recruiter at Acme Cloud", profileHref: "/in/sam-lee/", messages: recruiter } }];
          if (mode === "thread") return [{ result: { name: "Maya Chen", headline: "Engineering Manager at Northwind Labs", profileHref: "/in/maya-chen/", messages: friend } }];
          return [{ result: null }];
        }
        if (name === "readJobPosting") {
          return [{ result: { title: "Staff Frontend Engineer", company: "Contoso Cloud", description: "7+ years React, design systems." } }];
        }
        if (name === "insertIntoLinkedIn") {
          window.__inserted = args[0];
          return [{ result: { ok: true, kind: "message" } }];
        }
        return [{ result: { isLinkedInProfile: true, name: "Maya Chen", role: "Engineering Manager", company: "Northwind Labs" } }];
      },
    },
  };
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  window.__touches = [];
  window.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    const contact = (fields) => ({
      id: 7, name: "Maya Chen", company: "Northwind Labs", role: "Engineering Manager",
      linkedin_url: "https://www.linkedin.com/in/sample-profile/", status: "drafted",
      follow_up_due: false, days_since_sent: null, ...fields,
    });
    if (path === "/api/contacts/lookup/") {
      if (mode === "due") return reply(contact({ status: "sent", follow_up_due: true, days_since_sent: 6 }));
      if (mode === "recruiter") return reply(contact({ name: "Sam Lee", status: "sent", days_since_sent: 2 }));
      if (window.__touches.some((t) => t.event === "sent")) return reply(contact({ status: "sent", days_since_sent: 0 }));
      if (window.__draftCalls > 0) return reply(contact());
      return reply({ detail: "Not found." }, 404);
    }
    if (path === "/api/contacts/touch/") {
      const body = JSON.parse(init.body);
      window.__touches.push(body);
      if (body.event === "sent") return reply(contact({ status: "sent", days_since_sent: 0 }));
      return reply(contact({ status: "replied" }));
    }
    if (path === "/api/profile/" && init.method === "PUT") {
      window.__savedProfile = JSON.parse(init.body);
      return reply({ ...window.__savedProfile, completeness: 85 });
    }
    if (path === "/api/profile/") {
      return reply({ headline: "", summary: "", skills: "", target_roles: "", experience: "", writing_sample: "", completeness: mode === "own" ? 20 : 80 });
    }
    if (path.endsWith("/tweak/")) {
      return reply({ id: 2, text: "Hi Maya, I lead a React platform team and enjoyed your talk on scaling frontend teams. Would love to connect." }, 201);
    }
    window.__draftCalls += 1;
    window.__lastDraft = JSON.parse(init.body || "{}");
    return reply({
      id: 1,
      contact_id: 7,
      variants: [
        "Hi Maya, I lead a React platform team and your talk on scaling frontend teams at Northwind Labs hit close to home. Would be glad to connect and swap notes on developer experience.",
        "Hi Maya, your work growing the engineering org at Northwind Labs caught my attention. I build frontend platforms and would value being connected.",
        "Hi Maya - React platform lead here. Would like to connect and follow your work at Northwind Labs.",
      ],
    }, 201);
  };
})();
