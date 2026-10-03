const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const captures = process.env.EC_CAPTURE_DIR || path.resolve(root,'../04-ecdsa-ecdh-openssl/assets/capturas');
(async () => {
  await fs.mkdir(captures,{recursive:true});
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lab04-browser-'));
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:960},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto((process.env.EC_PREVIEW_URL || 'http://127.0.0.1:4321')+'/es/practices/standard-ec');
    await page.getByRole('button',{name:'Generar claves',exact:true}).click();
    await page.locator('#standard-ec-output').waitFor();
    const save=async(name,destination)=>{
      const waiting=page.waitForEvent('download');
      await page.getByRole('button',{name:'Descargar '+name,exact:true}).click();
      const downloaded=await waiting;await downloaded.saveAs(destination);
    };
    await save('private.pem',path.join(temp,'private.pem'));
    await save('public.pem',path.join(temp,'public.pem'));
    await page.getByLabel('Qué deseas hacer').selectOption('sign');
    await page.getByLabel('Clave privada (.pem)',{exact:true}).setInputFiles(path.join(temp,'private.pem'));
    const message=path.join(temp,'message.bin');await fs.writeFile(message,Buffer.from([0,1,2,255,65,66]));
    await page.getByLabel('Archivo que deseas firmar',{exact:true}).setInputFiles(message);
    await page.getByRole('button',{name:'Firmar archivo',exact:true}).click();
    await page.locator('#standard-ec-output').waitFor();
    await save('signature.txt',path.join(temp,'signature.txt'));
    await page.locator('#standard-ec-workspace').screenshot({path:path.join(captures,'ecdsa-firma.png')});
    const native=path.join(root,'c/standard-ec/build/standard-ec');
    assert.match(execFileSync(native,['verify',path.join(temp,'public.pem'),message,path.join(temp,'signature.txt')],{encoding:'utf8'}),/Valid = true/);
    await page.getByLabel('Qué deseas hacer').selectOption('verify');
    await page.getByLabel('Clave pública (.pem)',{exact:true}).setInputFiles(path.join(temp,'public.pem'));
    await page.getByLabel('Archivo que deseas verificar',{exact:true}).setInputFiles(message);
    await page.getByLabel('Firma (r, s) (.txt)',{exact:true}).setInputFiles(path.join(temp,'signature.txt'));
    await page.getByRole('button',{name:'Verificar firma',exact:true}).click();
    await page.getByText('Firma válida',{exact:true}).waitFor();
    await page.getByRole('region',{name:'Resultado',exact:true}).screenshot({path:path.join(captures,'ecdsa-valida.png')});
    const changed=path.join(temp,'changed.bin');await fs.writeFile(changed,'changed');
    await page.getByLabel('Archivo que deseas verificar',{exact:true}).setInputFiles(changed);
    await page.getByRole('button',{name:'Verificar firma',exact:true}).click();
    await page.getByText('Firma inválida',{exact:true}).waitFor();
    await page.getByRole('region',{name:'Resultado',exact:true}).screenshot({path:path.join(captures,'ecdsa-invalida.png')});
    await page.getByLabel('Qué deseas hacer').selectOption('ecdh');
    for (const curve of ['P-224','P-256','P-384','P-521']) {
      await page.getByLabel('Curva NIST').selectOption(curve);
      await page.getByRole('button',{name:'Simular ECDH',exact:true}).click();
      await page.locator('#standard-ec-output').waitFor();
      const text=await page.locator('#standard-ec-output').innerText();
      assert.match(text,/Agreement = true/);
      await fs.writeFile(path.join(captures,curve+'.txt'),text+'\n');
      await page.getByRole('region',{name:'Resultado',exact:true}).screenshot({path:path.join(captures,'ecdh-'+curve+'.png')});
    }
    // Reuse generated keys and signatures; drag-and-drop preserves binary contents.
    await page.getByLabel('Qué deseas hacer').selectOption('keygen');
    await page.getByLabel('Curva NIST').selectOption('P-256');
    await page.getByLabel('Nombre de la clave privada',{exact:true}).fill('Mi privada.pem');
    await page.getByLabel('Nombre de la clave pública',{exact:true}).fill('Mi pública.pem');
    await page.getByRole('button',{name:'Generar claves',exact:true}).click();
    await page.locator('#standard-ec-output').waitFor();
    await save('Mi privada.pem',path.join(temp,'reuse-private.pem'));
    await save('Mi pública.pem',path.join(temp,'reuse-public.pem'));
    await page.getByRole('button',{name:'Firmar con estas claves',exact:true}).click();
    assert.match(await page.locator('#private-upload').locator('..').innerText(),/Mi privada.pem/);
    const dropped = await page.evaluateHandle(() => {
      const transfer=new DataTransfer();
      transfer.items.add(new File([new Uint8Array([0,1,2,255,65,66])],'mensaje con espacios.bin'));
      return transfer;
    });
    await page.locator('#message-upload').locator('..').dispatchEvent('drop',{dataTransfer:dropped});
    await dropped.dispose();
    assert.match(await page.locator('#message-upload').locator('..').innerText(),/mensaje con espacios.bin/);
    await page.getByLabel('Nombre del archivo de firma',{exact:true}).fill('Mi firma.txt');
    await page.getByRole('button',{name:'Firmar archivo',exact:true}).click();
    await page.locator('#standard-ec-output').waitFor();
    await save('Mi firma.txt',path.join(temp,'reuse-signature.txt'));
    assert.match(execFileSync(native,['verify',path.join(temp,'reuse-public.pem'),message,
      path.join(temp,'reuse-signature.txt')],{encoding:'utf8'}),/Valid = true/);
    await page.getByRole('button',{name:'Verificar esta firma',exact:true}).click();
    assert.match(await page.locator('#signature-upload').locator('..').innerText(),/Mi firma.txt/);
    await page.getByRole('button',{name:'Verificar firma',exact:true}).click();
    await page.getByText('Firma válida',{exact:true}).waitFor();
    const resultDownload=page.waitForEvent('download');
    await page.getByRole('button',{name:'Descargar resultado (.txt)',exact:true}).click();
    await (await resultDownload).saveAs(path.join(temp,'verification.txt'));
    assert.match(await fs.readFile(path.join(temp,'verification.txt'),'utf8'),/Valid = true/);
    const binaryDownload=page.waitForEvent('download');
    await page.getByRole('button',{name:'Descargar mensaje con espacios.bin',exact:true}).click();
    await (await binaryDownload).saveAs(path.join(temp,'downloaded-message.bin'));
    assert.deepEqual(await fs.readFile(path.join(temp,'downloaded-message.bin')),await fs.readFile(message));
    // File-size validation happens before reading into the worker.
    await page.getByLabel('Archivo que deseas verificar',{exact:true}).setInputFiles({
      name:'too-large.bin',mimeType:'application/octet-stream',buffer:Buffer.alloc(16*1024*1024+1)});
    await page.getByRole('alert').filter({hasText:'16 MiB'}).waitFor();
    await page.getByLabel('Archivo que deseas verificar',{exact:true}).setInputFiles(message);
    // Independently stored ECDH keys must agree with native OpenSSL.
    execFileSync(native,['keygen','P-256',path.join(temp,'peer-private.pem'),path.join(temp,'peer-public.pem')]);
    await page.getByLabel('Qué deseas hacer').selectOption('derive');
    assert.doesNotMatch(await page.locator('#peer-upload').locator('..').innerText(),/Archivo listo:/);
    assert.match(await page.locator('#private-upload').locator('..').innerText(),/Mi privada.pem/);
    await page.getByLabel('Clave pública de la otra persona (.pem)',{exact:true}).setInputFiles(path.join(temp,'peer-public.pem'));
    await page.getByRole('button',{name:'ECDH con archivos',exact:true}).click();
    await page.locator('#standard-ec-output').waitFor();
    const agreement=await page.locator('#standard-ec-output').innerText();
    assert.equal(agreement.trim(),execFileSync(native,['derive',path.join(temp,'reuse-private.pem'),
      path.join(temp,'peer-public.pem')],{encoding:'utf8'}).trim());
    execFileSync(native,['keygen','P-384',path.join(temp,'wrong-private.pem'),path.join(temp,'wrong-public.pem')]);
    await page.getByLabel('Clave pública de la otra persona (.pem)',{exact:true}).setInputFiles(path.join(temp,'wrong-public.pem'));
    await page.getByRole('button',{name:'ECDH con archivos',exact:true}).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('#standard-ec-output').count(),0);
    await page.getByLabel('Qué deseas hacer').selectOption('verify');
    assert.match(await page.locator('#public-upload').locator('..').innerText(),/Mi pública.pem/);
    await page.getByRole('button',{name:'Verificar firma',exact:true}).click();
    await page.getByText('Firma válida',{exact:true}).waitFor();
    await page.getByLabel('Qué deseas hacer').selectOption('derive');
    await page.getByLabel('Tu clave privada (.pem)',{exact:true}).setInputFiles(path.join(temp,'peer-private.pem'));
    await page.getByLabel('Clave pública de la otra persona (.pem)',{exact:true}).setInputFiles(path.join(temp,'reuse-public.pem'));
    await page.getByRole('button',{name:'ECDH con archivos',exact:true}).click();
    await page.locator('#standard-ec-output').waitFor();
    assert.equal((await page.locator('#standard-ec-output').innerText()).trim(),agreement.trim());
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('#standard-ec-workspace').screenshot({path:path.join(captures,'mobile.png')});
    await page.goto((process.env.EC_PREVIEW_URL || 'http://127.0.0.1:4321')+'/practices/standard-ec');
    await page.getByRole('button',{name:'Generate keys',exact:true}).click();
    await page.locator('#standard-ec-output').waitFor();
    assert.deepEqual(errors,[]);
    console.log('PASS: real browser key downloads, binary file signing, native verification, tampering, all ECDH curves, drag-and-drop, reusable keys/signatures, exports, ECDH with imported keys, size/curve errors, mobile layout and English route.');
  } finally {await browser.close();await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exit(1)});
