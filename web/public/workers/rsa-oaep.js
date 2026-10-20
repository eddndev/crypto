import createModule from '/wasm/rsa-oaep/rsa-oaep.mjs';
import { serve } from '/workers/cli-runner.js';
serve(createModule, 'rsa-oaep');
