import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

const DOMAIN = 'https://tato-os.pages.dev';
const esc = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const out = await build({
  entryPoints: ['src/data/coffeeData.ts'],
  bundle: true, format: 'esm', platform: 'node', write: false,
});
const code = out.outputFiles[0].text;
const data = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const roasts = data.ROAST_PROFILES;
const specs = data.TERROIR_SPECS || [];
if (!roasts?.length) { console.error('ROAST_PROFILES not found'); process.exit(1); }

const urls = [`${DOMAIN}/`];
for (const r of roasts) {
  const url = `${DOMAIN}/roast/${r.id}/`;
  urls.push(url);
  const title = `TATO Coffee ${r.nameThai} (${r.name}) | Doi Wiang 1,834M`;
  const desc = `${r.description} Notes: ${r.notes.join(', ')}.`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product',
    name: `TATO Coffee ${r.name} roast (${r.nameThai})`,
    description: desc, brand: { '@type': 'Brand', name: 'TATO Coffee' }, url,
  };
  const html = `<!doctype html>
<html lang="th"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="product"><meta property="og:url" content="${url}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head><body style="font-family:sans-serif;background:#141312;color:#e6e1df;max-width:720px;margin:0 auto;padding:24px;line-height:1.6">
<h1>${esc(r.nameThai)} (${esc(r.name)})</h1>
<p>${esc(r.subtitle)}</p>
<p>${esc(r.description)}</p>
<h2>Tasting notes</h2><ul>${r.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>
<p>Intensity: ${esc(r.intensityDisplay)}</p>
${specs.length?`<h2>Origin</h2><ul>${specs.map(s=>`<li><b>${esc(s.label)}:</b> ${esc(s.value)}</li>`).join('')}</ul>`:''}
<p><a href="/" style="color:#ff5e1a">สั่งซื้อที่หน้าร้าน TATO Coffee</a></p>
</body></html>`;
  mkdirSync(`public/roast/${r.id}`, { recursive: true });
  writeFileSync(`public/roast/${r.id}/index.html`, html);
}
writeFileSync('public/sitemap.xml',
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u=>`  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`);
console.log('generated', roasts.length, 'roast pages;', urls.length, 'sitemap urls');
