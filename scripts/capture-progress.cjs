// Captura funciones completas para el avance, sin recortar sus bloques.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../STIC/01-elliptic-curve');
const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
(async () => {
  const sources = {};
  const manifest = [];
  for (const file of ['src/quadratic_residues.c','src/elliptic_curve.c','src/main.c','include/elliptic_curve.h']) {
    const text = await fs.readFile(path.join(root,file),'utf8');
    sources[file] = text.trimEnd().split('\n');
    manifest.push({file,sha256:createHash('sha256').update(text).digest('hex')});
  }
  const curve = sources['src/elliptic_curve.c'];
  const start = curve.findIndex(line=>line.startsWith('int rational_points('));
  if (start < 0 || curve[start-2] !== '}') throw new Error('Revisar limites de las funciones');
  const pages = [
    ['avance-residuos.png', [['src/quadratic_residues.c',1,sources['src/quadratic_residues.c'].length]]],
    ['avance-auxiliares.png', [['src/elliptic_curve.c',1,start],['include/elliptic_curve.h',1,sources['include/elliptic_curve.h'].length]]],
    ['avance-puntos.png', [['src/elliptic_curve.c',start+1,curve.length]]],
    ['avance-main.png', [['src/main.c',1,sources['src/main.c'].length]]],
  ];
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1160,height:1000},deviceScaleFactor:2});
    for (const [output, parts] of pages) {
      const blocks = parts.map(([file,first,last])=>`<header><strong>${file}</strong><span>Líneas ${first}–${last}</span></header><main>`+
        sources[file].slice(first-1,last).map((line,i)=>`<div class="row"><span>${first+i}</span><code class="${/^\s*(\/\*|\*(?:\s|\/))/.test(line)?'comment':''}">${escape(line)}</code></div>`).join('')+'</main>').join('');
      await page.setContent(`<!doctype html><html lang="es"><meta charset="utf-8"><style>
        *{box-sizing:border-box}body{margin:0;color:#18313d;background:white;font-family:Arial}
        header{background:#003b5c;color:white;padding:12px 20px;font-size:20px;display:flex;justify-content:space-between}
        main{padding:12px 14px}.row{display:flex;font:22px/27px 'Liberation Mono',monospace;min-height:27px}
        .row:nth-child(even){background:#f2f8fb}.row span{flex:0 0 48px;text-align:right;padding-right:14px;color:#8299a5}
        code{white-space:pre-wrap;overflow-wrap:anywhere;min-width:0;flex:1}.comment{color:#386854}
        </style><body>${blocks}</body></html>`);
      await page.locator('body').screenshot({path:path.join(root,'assets/capturas',output)});
    }
    // Actualiza tambien la evidencia con el ejecutable recien compilado.
    const binary = path.join(root,'build/elliptic-curve');
    const qr = execFileSync(binary,['qr','7'],{cwd:root,encoding:'utf8'});
    const points = execFileSync(binary,['curve','7','2','3','build/puntos-p7.txt'],{cwd:root,encoding:'utf8'});
    const transcript = '$ ./build/elliptic-curve qr 7\n'+qr+'\n$ ./build/elliptic-curve curve 7 2 3 build/puntos-p7.txt\n'+points;
    await page.setContent(`<!doctype html><html lang="es"><meta charset="utf-8"><style>
      body{margin:0;color:#e7eef4;background:#101a24}header{padding:22px 30px;background:#003b5c;font:22px Arial}
      pre{margin:0;padding:28px 32px;font:24px/34px 'Liberation Mono',monospace;white-space:pre-wrap}
      </style><body><header>Captura de consola</header><pre>${escape(transcript)}</pre></body></html>`);
    await page.locator('body').screenshot({path:path.join(root,'assets/capturas/ejecucion-nativa.png')});
    await fs.writeFile(path.join(root,'assets/ejecucion-nativa.txt'),transcript);
    await fs.writeFile(path.join(root,'assets/capturas/fuentes.json'),JSON.stringify(manifest,null,2)+'\n');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
