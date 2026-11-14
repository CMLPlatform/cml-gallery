import os, pathlib
from playwright.sync_api import sync_playwright

d = pathlib.Path(__file__).parent
out = d.parent.parent / "public" / "og.png"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME"))
    pg = b.new_page(viewport={"width": 1200, "height": 630})
    pg.goto(f"file://{d}/og-card.html")
    pg.evaluate("document.fonts.ready")
    pg.screenshot(path=str(out))
    b.close()
