// Turns the single-file artifact build into a claude.ai artifact page:
// no <html>/<head>/<body> wrapper, React from cdnjs, everything else inline.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('dist-artifact/index.html', 'utf8');
const pick = (re) => [...html.matchAll(re)].map((m) => m[0]).join('\n');
const title = html.match(/<title>.*?<\/title>/s)[0];
const fonts = pick(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/g);
const styles = pick(/<style[^>]*>[\s\S]*?<\/style>/g);
const scripts = pick(/<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/g).replace(/ type="module"/g, ' defer').replace(/ crossorigin/g, '');
const react = [
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>',
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>',
].join('\n');

// Inline scripts can't be deferred, so wait for the DOM explicitly.
const body = scripts.replace(/<script defer>([\s\S]*?)<\/script>/g, (_, code) =>
  `<script>window.addEventListener('DOMContentLoaded',function(){${code}});</script>`);

const out = [title, '<meta name="claude:viewport-fit-sides" content="cover">', fonts, styles, react, '<div id="root"></div>', body].join('\n');
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/index.html', out);
console.log(`artifact/index.html ${(out.length / 1024).toFixed(0)} KB`);
