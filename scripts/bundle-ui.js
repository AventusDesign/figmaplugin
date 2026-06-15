const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

const htmlTemplate = fs.readFileSync(path.join(root, 'src', 'ui.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'ui.css'), 'utf8');
const js = fs.readFileSync(path.join(dist, 'ui.js'), 'utf8');

const bundledHtml = htmlTemplate
  .replace('/*__CSS__*/', css)
  .replace('/*__JS__*/', js);

fs.writeFileSync(path.join(dist, 'ui.html'), bundledHtml);

const codePath = path.join(dist, 'code.js');
let code = fs.readFileSync(codePath, 'utf8');
const escaped = JSON.stringify(bundledHtml);
code = code.replace(/__html__/g, escaped);
fs.writeFileSync(codePath, code);

console.log('Bundled ui.html and inlined into code.js');
