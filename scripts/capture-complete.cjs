// Capturas del codigo completo de cada funcion solicitada y de ejecuciones.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname,'../STIC/01-elliptic-curve');
const out = path.join(root,'assets/capturas');
const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:1160,height:1000},deviceScaleFactor:2});
    const manifest=[];
    const files=['src/quadratic_residues.c','src/elliptic_curve.c','src/curve_arithmetic.c'];
    for (const file of files) {
      const text=await fs.readFile(path.join(root,file),'utf8');
      manifest.push({file,sha256:createHash('sha256').update(text).digest('hex')});
      const lines=text.trimEnd().split('\n');
      let ranges;
      if (file.endsWith('quadratic_residues.c')) ranges=[[0,lines.length,'residuos']];
      if (file.endsWith('/elliptic_curve.c')) {
        const start=lines.findIndex(line=>line.startsWith('int rational_points('));
        ranges=[[0,start,'salida-puntos'],[start,lines.length,'puntos']];
      }
      if (file.endsWith('/curve_arithmetic.c')) {
        const start=lines.findIndex(line=>line.startsWith('static Point infinity('));
        const end=lines.findIndex(line=>line.startsWith('void print_big('));
        ranges=[[0,start,'generacion'],[start,end,'aritmetica']];
      }
      for (const [first,last,name] of ranges) {
        await page.setContent(`<!doctype html><meta charset="utf-8"><style>
          *{box-sizing:border-box}body{margin:0;color:#18313d;background:white;font-family:Arial}
          header{background:#003b5c;color:white;padding:12px 20px;font-size:20px;display:flex;justify-content:space-between}
          main{padding:12px 14px}.row{display:flex;font:22px/27px 'Liberation Mono',monospace;min-height:27px}
          .row:nth-child(even){background:#f2f8fb}.row span{flex:0 0 48px;text-align:right;padding-right:14px;color:#8299a5}
          code{white-space:pre-wrap;overflow-wrap:anywhere;min-width:0;flex:1}.comment{color:#386854}
          </style><header><strong>${file}</strong><span>Líneas ${first+1}–${last}</span></header><main>${lines.slice(first,last).map((line,i)=>`<div class="row"><span>${i+first+1}</span><code class="${/^\s*(\/\*|\*(?:\s|\/))/.test(line)?'comment':''}">${escape(line)}</code></div>`).join('')}</main>`);
        await page.locator('body').screenshot({path:path.join(out,`final-${name}.png`)});
      }
    }
    // Copiamos la salida capturada del proceso, sin escribir resultados a mano.
    const binary=path.join(root,'build/elliptic-curve');
    let transcript='';
    for (const args of [['qr','7'],['curve','7','2','3','build/puntos-p7.txt'],['generate','16','20260924'],['add','65537','1','1','49606','64426','1','2565','62370','1'],['double','65537','1','1','49606','64426','1']]) {
      transcript+='$ ./build/elliptic-curve '+args.join(' ')+'\n'+execFileSync(binary,args,{cwd:root,encoding:'utf8'})+'\n';
    }
    await fs.writeFile(path.join(root,'assets/resultados/consola-completa.txt'),transcript);
    async function consoleShot(name,text) {
      await page.setContent(`<!doctype html><meta charset="utf-8"><style>body{margin:0;color:#e7eef4;background:#101a24}header{padding:18px 26px;background:#003b5c;font:22px Arial}pre{margin:0;padding:22px 26px;font:22px/30px 'Liberation Mono',monospace;white-space:pre-wrap;overflow-wrap:anywhere}</style><header>Captura de consola</header><pre>${escape(text)}</pre>`);
      await page.locator('body').screenshot({path:path.join(out,name)});
    }
    await consoleShot('final-consola.png',transcript);
    const operations=JSON.parse(await fs.readFile(path.join(root,'assets/resultados/operaciones.json'),'utf8'));
    let answers='';
    for (const row of operations) {
      answers+=`Caso ${row.case}) p = ${row.p}, a = ${row.a}, b = ${row.b}\n`;
      for (const key of ['P+Q','2P','2Q']) answers+=`${key} = (${row[key].join(', ')})\n`;
      answers+='\n';
    }
    await consoleShot('final-operaciones.png',answers);
    const curves=JSON.parse(await fs.readFile(path.join(root,'assets/resultados/curvas-generadas.json'),'utf8'));
    for (const [name,bits] of [['pequenas',[16,32,64,512]],['1024',[1024]],['2048',[2048]]]) {
      let text='';
      for (const curve of curves.filter(curve=>bits.includes(curve.bits))) {
        text+=`${curve.bits} bits · semilla ${curve.seed}\n`;
        for (const key of ['p','a','b']) {
          // Leemos el TXT para conservar cada digito del entero grande.
          const original=await fs.readFile(path.join(root,`assets/resultados/curva-${curve.bits}.txt`),'utf8');
          text+=original.split('\n').find(line=>line.startsWith(`${key} = `))+'\n';
        }
        text+='\n';
      }
      await consoleShot(`final-primos-${name}.png`,text);
    }
    await fs.writeFile(path.join(out,'fuentes-final.json'),JSON.stringify(manifest,null,2)+'\n');
    // La web ejecuta el mismo C mediante WebAssembly, en un Worker.
    const web = await browser.newPage({viewport:{width:1180,height:1000},deviceScaleFactor:2,reducedMotion:'reduce'});
    const errors=[];
    web.on('pageerror',error=>errors.push(String(error)));
    await web.goto((process.env.EC_PREVIEW_URL || 'http://127.0.0.1:4321')+'/es/stic/elliptic-curve',{waitUntil:'networkidle'});
    await web.getByRole('button',{name:'Calcular residuos',exact:true}).click();
    await web.locator('#qr-output').waitFor();
    await web.getByRole('button',{name:'Enumerar puntos',exact:true}).click();
    await web.locator('#curve-output').waitFor();
    assert.match(await web.locator('#qr-output').innerText(),/1, 2, 4/);
    assert.match(await web.locator('#curve-output').innerText(),/Total points .*: 6/);
    await web.setViewportSize({width:1180,height:4000});
    await web.evaluate(()=>window.scrollTo(0,0));
    await web.locator('#ec-workspace > .grid').screenshot({path:path.join(out,'final-web-puntos.png')});
    await web.getByRole('button',{name:'Generar curva',exact:true}).click();
    await web.locator('#generate-output').waitFor({timeout:60000});
    await web.getByRole('button',{name:'Sumar puntos',exact:true}).click();
    await web.locator('#add-output').waitFor();
    await web.getByRole('button',{name:'Duplicar punto',exact:true}).click();
    await web.locator('#double-output').waitFor();
    const add=execFileSync(binary,['add','65537','1','1','49606','64426','1','2565','62370','1'],{encoding:'utf8'}).trim();
    assert.equal(await web.locator('#add-output').innerText(),add);
    await web.evaluate(()=>window.scrollTo(0,0));
    await web.locator('#arithmetic-workspace').screenshot({path:path.join(out,'final-web-aritmetica.png')});
    await web.locator('#generate-section select').selectOption('2048');
    await web.getByRole('button',{name:'Generar curva',exact:true}).click();
    await web.waitForFunction(()=>document.querySelector('#generate-output')?.textContent?.includes('bits = 2048'),{},{timeout:60000});
    const generated=await web.locator('#generate-output').innerText();
    assert.equal(BigInt(generated.match(/^p = (\d+)$/m)[1]).toString(2).length,2048);
    await web.locator('#double-section input[name=py]').fill('0');
    await web.getByRole('button',{name:'Duplicar punto',exact:true}).click();
    await web.getByRole('alert').waitFor();
    assert.match(await web.getByRole('alert').innerText(),/no pertenece/);
    assert.equal(await web.locator('#double-output').count(),0);
    await web.setViewportSize({width:390,height:844});
    assert.equal(await web.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    await web.goto((process.env.EC_PREVIEW_URL || 'http://127.0.0.1:4321')+'/stic/elliptic-curve',{waitUntil:'networkidle'});
    await web.getByRole('button',{name:'Add points',exact:true}).click();
    await web.locator('#add-output').waitFor();
    assert.equal(await web.locator('#add-output').innerText(),add);
    console.log('PASS: capturas, formularios, 2048 bits, errores, ingles y movil.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
