// Run with the built Astro preview server on EC_PREVIEW_URL (default port 4321).
// Install Playwright separately, or set PLAYWRIGHT_MODULE to its installed path.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const practice = path.join(root, 'STIC/01-elliptic-curve');
const assets = path.join(practice, 'assets');
const captures = path.join(assets, 'capturas');
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

async function main() {
  await fs.mkdir(captures, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1160, height: 1000 }, deviceScaleFactor: 1.5, reducedMotion: 'reduce' });
    const files = [
      ['src/quadratic_residues.c', [[1, 47]], 'codigo-residuos'],
      ['src/elliptic_curve.c', [[1, 24], [25, 65]], 'codigo-curva'],
      ['src/main.c', [[1, 36]], 'codigo-main'],
      ['include/elliptic_curve.h', [[1, 18]], 'codigo-interfaz'],
    ];
    const manifest = [];
    for (const [relative, ranges, name] of files) {
      const source = await fs.readFile(path.join(practice, relative), 'utf8');
      const lines = source.trimEnd().split('\n');
      manifest.push({ file: relative, sha256: createHash('sha256').update(source).digest('hex') });
      const split = lines.findIndex(line => line.startsWith('int rational_points('));
      const completeRanges = split >= 0 && relative.endsWith('.c')
        ? [[1, split], [split + 1, lines.length]] : [[1, lines.length]];
      for (const [index, [start, end]] of completeRanges.entries()) {
        const rows = lines.slice(start-1, end).map((line, i) => `<div class="row"><span class="number">${start+i}</span><code>${escape(line) || ' '}</code></div>`).join('');
        await page.setContent(`<!doctype html><html lang="es"><meta charset="utf-8"><style>
          *{box-sizing:border-box}body{margin:0;background:#fff;color:#18313d;font-family:Arial,sans-serif}
          header{background:#003b5c;color:#fff;padding:18px 26px;font-size:22px;display:flex;justify-content:space-between}
          .subtitle{padding:12px 26px;background:#edf5f9;font-size:17px;color:#405a68}
          .code{padding:18px 16px 24px}.row{display:flex;font:21px/26px 'Liberation Mono',monospace;min-height:26px}
          .number{flex:0 0 48px;text-align:right;padding-right:16px;color:#8a9ba5;user-select:none}
          code{white-space:pre-wrap;overflow-wrap:anywhere;flex:1;min-width:0} .row:nth-child(even){background:#f5f9fc}
          </style><body><header><strong>Elliptic Curve / C17</strong><span>${escape(relative)}</span></header>
          <div class="subtitle">Visor de código fuente · líneas ${start}–${end} · archivo del proyecto</div><div class="code">${rows}</div></body></html>`);
        await page.locator("body").screenshot({ path: path.join(captures, `${name}-${index+1}.png`) });
      }
    }
    await fs.writeFile(path.join(captures,'fuentes.json'),JSON.stringify(manifest,null,2)+'\n');

    // These are real outputs of the compiled native C executable.
    const binary = path.join(practice, 'build/elliptic-curve');
    const qr = execFileSync(binary, ['qr', '7'], { encoding: 'utf8', cwd: practice });
    const curve = execFileSync(binary, ['curve','7','2','3','build/puntos-p7.txt'], { encoding:'utf8',cwd:practice });
    const transcript = '$ ./build/elliptic-curve qr 7\n'+qr+'\n$ ./build/elliptic-curve curve 7 2 3 build/puntos-p7.txt\n'+curve;
    await fs.writeFile(path.join(assets,'ejecucion-nativa.txt'),transcript);
    await page.setContent(`<!doctype html><html lang="es"><meta charset="utf-8"><style>
      body{margin:0;color:#e7eef4;background:#101a24}header{padding:22px 30px;background:#003b5c;font:22px Arial}
      pre{margin:0;padding:28px 32px;font:24px/34px 'Liberation Mono',monospace;white-space:pre-wrap}
      </style><body><header>Captura de consola</header><pre>${escape(transcript)}</pre></body></html>`);
    await page.locator('body').screenshot({ path:path.join(captures,'ejecucion-nativa.png') });

    const errors=[]; page.on('pageerror', error=>errors.push(error.message));
    await page.setViewportSize({ width:1440,height:1100 });
    const base=process.env.EC_PREVIEW_URL || 'http://127.0.0.1:4321';
    await page.goto(`${base}/es/stic/elliptic-curve`);
    await page.getByRole('button',{name:'Calcular residuos',exact:true}).click();
    await page.locator('#qr-output').waitFor();
    assert.equal(await page.locator('#qr-output').innerText(),qr.trimEnd());
    await page.getByRole('button',{name:'Enumerar puntos',exact:true}).click();
    await page.locator('#curve-output').waitFor();
    assert.match(await page.locator('#curve-output').innerText(),/Total points \(including infinity\): 6/);
    await page.locator('#ec-workspace').screenshot({path:path.join(captures,'ejecucion-web.png')});
    await page.locator('section[aria-labelledby="qr-title"]').screenshot({path:path.join(captures,'ejecucion-web-residuos.png')});
    await page.locator('section[aria-labelledby="curve-title"]').screenshot({path:path.join(captures,'ejecucion-web-puntos.png')});
    const downloading=page.waitForEvent('download');
    await page.getByRole('button',{name:'Descargar puntos (.txt)',exact:true}).click();
    const downloaded=await downloading;
    const data=await fs.readFile(await downloaded.path(),'utf8');
    assert.equal(data,await fs.readFile(path.join(practice,'build/puntos-p7.txt'),'utf8'));
    await fs.writeFile(path.join(assets,'puntos-p7-a2-b3.txt'),data);
    assert.deepEqual(errors,[]);
    console.log('Evidence captured from current C sources, native execution, browser execution, and downloaded text.');
  } finally { await browser.close(); }
}
main().catch(error=>{ console.error(error);process.exit(1); });
