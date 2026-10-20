import createModule from '/wasm/rsa-crt/rsa-crt.mjs';
import { serve } from '/workers/cli-runner.js';
serve(createModule, 'rsa-crt');
