// Read-only re-verification: dApp reads + fee construction + receipt fields
// for the earlier live write txs (no new writes).
import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import * as lib from '/tmp/gmvdapp-lib.mjs';

const FUND = '0x2cbae1e01eee1ca7b082e42280ea390492866612a7f4d4e0092ba996e4c8ac53';
const CANCEL = '0x0611c33521bc793c922afbe420f9779bddd30ff29fdb5ae7a95cef9a8c66d90d';
const client = createClient({ chain: testnetBradbury, endpoint: 'https://rpc-bradbury.genlayer.com' });
let pass = 0, fail = 0;
const check = (n, ok, d) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n} ${d ?? ''}`); ok ? pass++ : fail++; };

const ov = await lib.readJsonView('get_protocol_overview', []);
check('overview grant_count=4 (3 lifecycle + 1 dApp test)', ov.grant_count === '4', JSON.stringify(ov));
check('overview balance 0.01 GEN escrow', ov.contract_balance_wei === '10000000000000000', ov.contract_balance_wei);
const g0 = await lib.readJsonView('get_grant', [0]);
check('grant 0 verdict met=true', g0?.milestones?.[0]?.verdict?.met === true, '');
check('grant 0 grounding sha', g0?.milestones?.[0]?.verdict?.grounding?.primary_sha256 === '48d2727aba263c3c3ea5c5f1b823bb97e1007e3d55e899781c32226839e134ba', '');
const g3 = await lib.readJsonView('get_grant', [3]);
check('grant 3 = dApp test grant, CANCELLED', g3 && g3.status === 'CANCELLED' && g3.title.startsWith('dApp verification'), g3?.status);
const hist = await lib.readJsonView('get_activity_history', [50]);
check('activity history non-empty', Array.isArray(hist) && hist.length > 0, `entries=${hist?.length}`);
const fees = await lib.payoutFees('0x0BbA411375d7074178980E610B5311dD6Ed34d74');
const a = fees.messageAllocations[0];
check('allocation budget 0.0012 GEN exact multiple', a.budget === 1200000000000000n && a.budget % (200000n * 300000000n) === 0n, String(a.budget));
check('allocation callKey 32 zero bytes', a.callKey === '0x' + '00'.repeat(32), '');
check('feeValue = roundFees + budget', fees.feeValue === 100000000000010352n + 1200000000000000n, String(fees.feeValue));
const base = lib.baseFees();
check('base fees', base.feeValue === 100000000000010352n && base.messageAllocations.length === 0, '');
for (const [tag, h] of [['fund', FUND], ['cancel', CANCEL]]) {
  const r = await client.waitForTransactionReceipt({ hash: h, waitUntil: 'finalized', retries: 30, interval: 5000 });
  const exec = r.txExecutionResultName || r.execName;
  check(`${tag} receipt exec FINISHED_WITH_RETURN`, exec === 'FINISHED_WITH_RETURN', `exec=${exec} result=${r.resultName} status=${r.statusName || r.status_name}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
