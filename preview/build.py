# Builds an artifact preview of the site into ../kbpreview (relative paths + in-browser API).
import re, shutil, pathlib
src = pathlib.Path('public'); out = pathlib.Path('/home/claude/kbpreview')
if out.exists(): shutil.rmtree(out)
shutil.copytree(src, out)
shutil.copy('preview/preview-api.js', out / 'js/preview-api.js')
def fix(t):
    t = re.sub(r'(["\'(])/(css|js|img)/', r'\1\2/', t)
    t = t.replace('href="/help?signup=1"', 'href="help.html?signup=1"').replace('href="/help"', 'href="help.html"').replace('href="/admin"', 'href="admin.html"').replace('href="/"', 'href="index.html"')
    t = t.replace("'/help?verified", "'help.html?verified").replace("'/help' + location.hash", "'help.html' + location.hash").replace("'/help')", "'help.html')")
    t = t.replace('`/img/kb/${n}.jpg`', '`img/kb/${n}.jpg`')
    return t
for p in list(out.rglob('*.html')) + list(out.rglob('*.js')) + list(out.rglob('*.css')):
    t = fix(p.read_text())
    if p.suffix == '.html':
        t = t.replace('<link rel="stylesheet" href="css/site.css">', '<link rel="stylesheet" href="css/site.css">\n<script src="js/preview-api.js"></script>')
    p.write_text(t)
# the main page is wrapped by the artifact skeleton: strip its own document tags
ix = out / 'index.html'; t = ix.read_text()
t = re.sub(r'<!doctype html>\s*<html[^>]*>\s*<head>\s*<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*', '', t, flags=re.I)
t = t.replace('</head>\n<body>\n', '').replace('</body>\n</html>', '')
t = t.replace('<title>Fleetroot Knowledge Base</title>', '<title>Fleetroot Knowledge Base</title>\n<meta name="claude:viewport-fit-sides" content="cover">', 1)
ix.write_text(t)
print(sorted(str(p.relative_to(out)) for p in out.rglob('*') if p.is_file()))
