// Live verification of the dApp's own code against GMV v2.2 on Bradbury.
// Uses the bundled dApp lib (/tmp/gmvdapp-lib.mjs) for reads + fee construction,
// and a node genlayer client (test wallet A, same shape as lifecycle-v2.2.mjs)
// for the write path — the browser write path (window.ethereum provider)
// follows the waybill-dashboard's proven writeClient exactly and cannot be
// exercised from node; that distinction is reported honestly.
// Writes: ONE tiny clearly-labelled test grant (1 x 0.001 GEN), funded exact,
// then cancelled with the refund verified by balance delta.
import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync } from 'fs';
import * as lib from '/tmp/gmvdapp-lib.mjs';

const ADDR = lib.CONTRACT_ADDRESS;
const GEN = 10n ** 18n;
const wA = JSON.parse(readFileSync('/home/hatch/workspace/waybill-test/test-wallet.json'));
const wB = JSON.parse(readFileSync('/home/hatch/workspace/waybill-test/carrier-wallet.json'));
const acctA = privateKeyToAccount(wA.privateKey);
const acctB = privateKeyToAccount(wB.privateKey);
const client = createClient({ chain: testnetBradbury, account: acctA });
const results = { contract: ADDR, checks: [] };
const check = (name, pass, detail) => {
  results.checks.push({ name, pass, detail: String(detail ?? '') });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${detail ?? ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Reads through the dApp's readJsonView
const ov = await lib.readJsonView('get_protocol_overview', []);
check('overview grant_count=3', ov && ov.grant_count === '3', JSON.stringify(ov));
check('overview balance 0.01 GEN', ov && ov.contract_balance_wei === '10000000000000000', ov?.contract_balance_wei);
const g0 = await lib.readJsonView('get_grant', [0]);
check('grant 0 title', g0 && g0.title === 'Bradbury v2.2 lifecycle test grant', g0?.title);
check('grant 0 verdict met=true', g0?.milestones?.[0]?.verdict?.met === true, JSON.stringify(g0?.milestones?.[0]?.verdict?.grounding));
check('grant 0 grounding sha', g0?.milestones?.[0]?.verdict?.grounding?.primary_sha256 === '48d2727aba263c3c3ea5c5f1b823bb97e1007e3d55e899781c32226839e134ba', g0?.milestones?.[0]?.verdict?.grounding?.primary_sha256);
const hist = await lib.readJsonView('get_activity_history', [50]);
check('activity history non-empty', Array.isArray(hist) && hist.length > 0, `entries=${hist?.length}`);

// 2. Fee construction through the dApp's payoutFees (Twin14 allocation)
const fees = await lib.payoutFees(acctB.address);
const alloc = fees.messageAllocations[0];
check('allocation messageType external', alloc.messageType === 0, String(alloc.messageType));
check('allocation recipient = B', String(alloc.recipient).toLowerCase() === acctB.address.toLowerCase(), String(alloc.recipient));
check('allocation budget 0.0012 GEN', alloc.budget === 1200000000000000n, String(alloc.budget));
check('allocation budget exact multiple', alloc.budget % (200000n * 300000000n) === 0n, `${alloc.budget / (200000n * 300000000n)}x`);
check('allocation callKey 32 zero bytes', alloc.callKey === '0x' + '00'.repeat(32), String(alloc.callKey));
check('distribution totalMessageFees = budget', fees.distribution.totalMessageFees === 1200000000000000n, String(fees.distribution.totalMessageFees));
check('feeValue = roundFees + budget', fees.feeValue === 100000000000010352n + 1200000000000000n, String(fees.feeValue));
const base = lib.baseFees();
check('base fees feeValue', base.feeValue === 100000000000010352n && base.messageAllocations.length === 0, String(base.feeValue));

// 3. Write path with the dApp's fee objects (node client, test wallet A)
const send = async (fn, args, value, f) => {
  const hash = await client.writeContract({ address: ADDR, functionName: fn, args, value, fees: f });
  const receipt = await client.waitForTransactionReceipt({ hash, waitUntil: 'finalized', retries: 360, interval: 5000 });
  console.log(`  ${fn} tx=${hash} exec=${receipt.resultName || receipt.execName}`);
  return { hash, receipt };
};
const balA0 = await lib.ethBalance(acctA.address);
const ms = JSON.stringify([{ spec: 'dApp verification — test milestone (not a real grant).', amount_wei: (GEN / 1000n).toString() }]);
const r1 = await send('create_grant', [acctB.address.toLowerCase(), 'dApp verification — test grant (not a real grant)', ms], 0n, lib.baseFees());
check('create_grant FINISHED_WITH_RETURN', (r1.receipt.resultName || r1.receipt.execName) === 'FINISHED_WITH_RETURN', r1.hash);
const ov2 = await lib.readJsonView('get_protocol_overview', []);
const newId = Number(ov2.grant_count) - 1;
check('grant_count grew to 4', ov2.grant_count === '4', ov2.grant_count);
const r2 = await send('fund_grant', [newId], GEN / 1000n, await lib.payoutFees(acctA.address));
check('fund_grant exact 0.001 GEN', (r2.receipt.resultName || r2.receipt.execName) === 'FINISHED_WITH_RETURN', r2.hash);
const gN = await lib.readJsonView('get_grant', [newId]);
check('test grant FUNDED', gN && gN.status === 'FUNDED', gN?.status);
const balA1 = await lib.ethBalance(acctA.address);
const r3 = await send('cancel_grant', [newId], 0n, await lib.payoutFees(acctA.address));
check('cancel_grant FINISHED_WITH_RETURN', (r3.receipt.resultName || r3.receipt.execName) === 'FINISHED_WITH_RETURN', r3.hash);
const gN2 = await lib.readJsonView('get_grant', [newId]);
check('test grant CANCELLED', gN2 && gN2.status === 'CANCELLED', gN2?.status);
const d = await lib.balanceDelta(acctA.address, balA1);
check('cancel refund landed (A delta > 0, ~+0.001 GEN minus fees)', d.deltaWei > 0n && d.deltaWei < GEN / 1000n, `delta=${d.deltaWei} wei`);
const ov3 = await lib.readJsonView('get_protocol_overview', []);
check('contract balance back to 0.01 GEN escrow', ov3.contract_balance_wei === '10000000000000000', ov3.contract_balance_wei);
results.newGrantId = newId;
results.createTx = r1.hash; results.fundTx = r2.hash; results.cancelTx = r3.hash;
results.balances = { A_before: balA0.toString(), A_after_cancel: d.after.toString(), cancelDeltaWei: d.deltaWei.toString() };
console.log(JSON.stringify(results, null, 2));
