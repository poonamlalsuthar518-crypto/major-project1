const fs = require("fs");
const path = require("path");
const root = process.cwd();
const files = fs.readdirSync(root).filter((name) => name.endsWith(".html"));

for (const name of files) {
  const file = path.join(root, name);
  let html = fs.readFileSync(file, "utf8");
  let changed = false;

  if (!/rel=["']manifest["']/.test(html)) {
    const tags = [
      '    <link rel="manifest" href="/manifest.webmanifest">',
      '    <meta name="theme-color" content="#1e3a5f">'
    ].join("\n");
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, `${tags}\n</head>`);
      changed = true;
    }
  }

  if (!/pwa-register\.js/.test(html)) {
    if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i,
        '    <script src="/js/pwa-register.js" defer></script>\n</body>');
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file, html, "utf8");
    console.log("Updated", name);
  } else {
    console.log("No change needed:", name);
  }
}
