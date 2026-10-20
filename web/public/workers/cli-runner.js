// Runs one command of a C17 CLI compiled with Emscripten (argv built in the module heap).
export function serve(createModule, program) {
  const symbol = program.replace(/-/g, '_');
  self.onmessage = async ({ data }) => {
    let module;
    const output = [], errors = [], pointers = [], paths = [];
    try {
      module = await createModule({ print: line => output.push(line), printErr: line => errors.push(line) });
      const allocate = size => {
        const pointer = module._malloc(size);
        if (!pointer) throw new Error('Insufficient memory.');
        pointers.push({ pointer, size });
        return pointer;
      };
      // OpenSSL's generator receives 48 bytes from the browser before any command.
      const entropy = crypto.getRandomValues(new Uint8Array(48));
      const seed = allocate(entropy.length);
      module.HEAPU8.set(entropy, seed);
      entropy.fill(0);
      const seeded = module[`_${symbol}_seed`](seed, 48);
      module.HEAPU8.fill(0, seed, seed + 48);
      if (seeded) throw new Error('Random generator initialization failed.');
      for (const file of data.inputs ?? []) {
        module.FS.mkdirTree(file.path.slice(0, file.path.lastIndexOf('/')) || '/');
        module.FS.writeFile(file.path, new Uint8Array(file.bytes));
        paths.push(file.path);
      }
      // The C program never overwrites files, so stale outputs are removed first.
      for (const path of data.outputs ?? []) {
        module.FS.mkdirTree(path.slice(0, path.lastIndexOf('/')) || '/');
        try { module.FS.unlink(path); } catch { /* It did not exist. */ }
        paths.push(path);
      }
      const args = [program, ...data.args];
      const strings = args.map(value => {
        const size = module.lengthBytesUTF8(value) + 1;
        const pointer = allocate(size);
        module.stringToUTF8(value, pointer, size);
        return pointer;
      });
      const argv = allocate(4 * (args.length + 1));
      const heap = module.HEAPU32; // Read after every malloc: memory growth replaces the view.
      strings.forEach((pointer, index) => { heap[(argv >> 2) + index] = pointer; });
      heap[(argv >> 2) + args.length] = 0;
      let code;
      try { code = module[`_${symbol}_cli`](args.length, argv); }
      catch (error) { if (error?.name === 'ExitStatus') code = error.status; else throw error; }
      const files = code === 0 ? (data.outputs ?? []).map(path => ({ path, bytes: module.FS.readFile(path) })) : [];
      self.postMessage({ code, output: output.join('\n'), error: errors.join('\n'), files }, files.map(file => file.bytes.buffer));
    } catch (error) {
      self.postMessage({ code: 1, output: output.join('\n'), error: errors.concat(String(error)).join('\n'), files: [] });
    } finally {
      if (module) {
        for (const { pointer, size } of pointers) { module.HEAPU8.fill(0, pointer, pointer + size); module._free(pointer); }
        for (const path of paths) {
          try {
            const bytes = module.FS.readFile(path);
            bytes.fill(0);
            module.FS.writeFile(path, bytes);
            module.FS.unlink(path);
          } catch { /* The command may not have created the file. */ }
        }
      }
      self.close();
    }
  };
}
