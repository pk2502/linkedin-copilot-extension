"""Render Chrome Web Store images from the real popup (sample data only)."""
import functools, http.server, threading, pathlib, sys
from playwright.sync_api import sync_playwright

EXT = pathlib.Path(__file__).resolve().parents[2]
OUT = EXT / "store" / "assets"
STUB = (pathlib.Path(__file__).parent / "stub.js").read_text()

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(EXT))
handler.log_message = lambda *a: None
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{server.server_port}"

FRAME = """<!doctype html><html><head><style>
  body{{margin:0;width:1280px;height:800px;display:flex;align-items:center;justify-content:center;gap:88px;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:linear-gradient(135deg,#eef0ff,#f6efff)}}
  .copy{{width:520px}} h1{{font-size:46px;line-height:1.1;margin:0 0 20px;color:#1a1a2e;letter-spacing:-0.02em}}
  p{{font-size:21px;line-height:1.5;color:#4a4a68;margin:0 0 14px}}
  .card{{border-radius:14px;overflow:hidden;box-shadow:0 24px 60px rgba(60,40,140,.25);background:#fff}}
  iframe{{border:0;width:320px;height:{h}px;display:block}}
</style></head><body>
  <div class="copy"><h1>{title}</h1>{body}</div>
  <div class="card"><iframe src="{src}"></iframe></div>
</body></html>"""

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    ctx.add_init_script(STUB)
    page = ctx.new_page()

    def popup_height(mode, act=None):
        p = ctx.new_page(); p.set_viewport_size({"width": 320, "height": 900})
        p.goto(f"{BASE}/popup.html?mode={mode}"); p.wait_for_timeout(300)
        if act: act(p)
        h = p.evaluate("document.body.scrollHeight"); p.close(); return h

    def generate(p):
        p.click("#generateBtn"); p.wait_for_selector("#outputSection", state="visible")

    shots = [
        ("screenshot-1-draft.png", "main", generate, "Draft LinkedIn messages in seconds",
         "<p>Open ConnectPilot on a profile. Name, role and company are filled in for you.</p>"
         "<p>Get three drafts in your voice, tweak one, copy it. You send it yourself.</p>"),
        ("screenshot-2-signin.png", "signin", None, "Sign in your way",
         "<p>Use your ConnectPilot username and password, or sign in through the web app, including with Google.</p>"
         "<p>No automation: ConnectPilot never clicks or sends anything on LinkedIn.</p>"),
    ]
    for name, mode, act, title, body in shots:
        h = popup_height(mode, act)
        html = FRAME.format(h=min(h, 740), title=title, body=body, src=f"{BASE}/popup.html?mode={mode}")
        (OUT / "_frame.html").write_text(html)
        page.goto(f"{BASE}/store/assets/_frame.html"); page.wait_for_timeout(500)
        if act:
            act(page.frames[1])  # the popup iframe
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / name))
        print("wrote", name, "popup height", h)

    tile = page
    tile.set_viewport_size({"width": 440, "height": 280})
    (OUT / "_tile.html").write_text(f"""<!doctype html><html><body style="margin:0;width:440px;height:280px;display:flex;
      flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      background:linear-gradient(135deg,#5145e5,#7a3aed);color:#fff">
      <img src="/icon128.png" width="84" height="84" style="border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,.25)">
      <div style="font-size:34px;font-weight:700;letter-spacing:-0.02em">ConnectPilot</div>
      <div style="font-size:16px;opacity:.9">AI drafts for LinkedIn messages. You hit send.</div></body></html>""")
    tile.goto(f"{BASE}/store/assets/_tile.html"); tile.wait_for_timeout(300)
    tile.screenshot(path=str(OUT / "promo-tile-440x280.png"))
    print("wrote promo tile")
    browser.close()
for f in ("_frame.html", "_tile.html"):
    (OUT / f).unlink(missing_ok=True)
server.shutdown()
