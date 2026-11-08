#!/usr/bin/env python3
"""Bundle Realm Diggers into one self-contained HTML file.

    python3 tools/build_single.py              -> dist/realm-diggers.html (open it in any browser)
    python3 tools/build_single.py --fragment   -> dist/realm-diggers-fragment.html
                                                  (no <html>/<head>/<body> wrapper, for hosts that add their own)

The only external resource left is the optional Google Fonts stylesheet; without
internet the game falls back to system fonts and plays the same.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def build(fragment: bool) -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "style.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css + "\n</style>")

    def inline_script(m: re.Match) -> str:
        src = (ROOT / m.group(1)).read_text(encoding="utf-8")
        # keep a literal "</script>" inside JS from ending the tag early
        return "<script>\n" + src.replace("</script>", "<\\/script>") + "\n</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)
    if fragment:
        head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
        body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
        # the host page supplies charset + viewport; keep title, fonts and styles
        head = re.sub(r'<meta charset="utf-8">\s*', "", head)
        head = re.sub(r'<meta name="viewport"[^>]*>\s*', "", head)
        html = head.strip() + "\n" + body.strip() + "\n"
    return html


def main() -> None:
    fragment = "--fragment" in sys.argv
    out_dir = ROOT / "dist"
    out_dir.mkdir(exist_ok=True)
    out = out_dir / ("realm-diggers-fragment.html" if fragment else "realm-diggers.html")
    out.write_text(build(fragment), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
