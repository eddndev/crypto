import createModule from '/wasm/mac/mac.mjs';
import { serve } from '/workers/cli-runner.js';
serve(createModule, 'mac');
