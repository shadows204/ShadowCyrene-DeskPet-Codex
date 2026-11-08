'use strict';
const {QuotaClient} = require('../app/quota-client.cjs');
const {quotaView} = require('../app/core.cjs');
const path = process.argv[2] || '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
const client = new QuotaClient(path);
let plan;
client.on('account', value => { plan = value.planType; });
client.on('offline', () => {});
client.start().then(value => {
  // Sanitized result only: never emit email, account ID, tokens, credit IDs, or raw CLI stderr.
  console.log(JSON.stringify({ok: true, quota: quotaView(value, plan)}, null, 2));
}).catch(error => { console.log(JSON.stringify({ok: false, message: error.message})); process.exitCode = 1; }).finally(() => client.stop());
