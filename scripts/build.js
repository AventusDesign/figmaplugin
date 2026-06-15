const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const HTML_PLACEHOLDER = '___INJECT_UI_HTML___';

function build() {
  if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });

  esbuild.buildSync({
    entryPoints: [path.join(root, 'src/ui.ts')],
    bundle: true,
    outfile: path.join(dist, 'ui.bundle.js'),
    target: 'es2017',
    format: 'iife',
    logLevel: 'silent',
  });

  const htmlTemplate = fs.readFileSync(path.join(root, 'src/ui.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/ui.css'), 'utf8');
  const js = fs.readFileSync(path.join(dist, 'ui.bundle.js'), 'utf8');
  const bundledHtml = htmlTemplate.replace('/*__CSS__*/', css).replace('/*__JS__*/', js);
  fs.writeFileSync(path.join(dist, 'ui.html'), bundledHtml);

  esbuild.buildSync({
    entryPoints: [path.join(root, 'src/code.ts')],
    bundle: true,
    outfile: path.join(dist, 'code.js'),
    target: 'es2017',
    format: 'iife',
    logLevel: 'silent',
  });

  let code = fs.readFileSync(path.join(dist, 'code.js'), 'utf8');
  const markerPattern = /(["'])___INJECT_UI_HTML___\1/;
  if (!markerPattern.test(code)) {
    throw new Error('Placeholder ___INJECT_UI_HTML___ not found in bundled code.js');
  }
  code = code.replace(markerPattern, JSON.stringify(bundledHtml));
  fs.writeFileSync(path.join(dist, 'code.js'), code);

  console.log('Build complete → dist/code.js, dist/ui.html');
}

const watch = process.argv.includes('--watch');

if (watch) {
  const ctx = esbuild.context({
    entryPoints: [path.join(root, 'src/code.ts'), path.join(root, 'src/ui.ts')],
    bundle: true,
    outdir: dist,
    target: 'es2017',
    format: 'iife',
    logLevel: 'info',
  });
  ctx.then((c) => {
    c.watch();
    console.log('Watching for changes…');
  });
} else {
  build();
}
