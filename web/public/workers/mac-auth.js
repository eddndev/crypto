import createModule from '/wasm/mac-auth/mac-auth.mjs';
import { serve } from '/workers/cli-runner.js';
serve(createModule, 'mac-auth');
