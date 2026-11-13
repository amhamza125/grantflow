// Create grant — a 2-step wizard (UX round), same on-chain payload as
// before: onCreate({ builder, title, milestones }).
//   Step 1 "Who & what": builder address + title. Continue stays disabled
//   until both are valid.
//   Step 2 "Money & deadline": per-milestone spec + amount (quick-fill
//   chips 0.001 / 0.005 / 0.01 GEN) + deadline days (chips 7 / 14 / 30),
//   add/remove milestones kept, and a live total preview — "Total escrow
//   — X GEN · N milestone(s) · locked when you fund · you hold Y GEN"
//   (the balance is the wallet's real GEN from the store; hidden until
//   the wallet is connected). Creating costs no GEN — funding locks the
//   escrow afterwards, in a separate step, for the exact total.
import React, { useState } from "react";
import { weiToGen } from "../lib/genlayer.js";

function isAddress(v) {
  return /^0x[0-9a-fA-F]{40}$/.test(v.trim());
}

const AMOUNT_CHIPS = ["0.001", "0.005", "0.01"];
const DAYS_CHIPS = ["7", "14", "30"];

export default function CreateGrant({ onCreate, busy, account, onConnect, walletBalance }) {
  const [step, setStep] = useState(1);
  const [builder, setBuilder] = useState("");
  const [title, setTitle] = useState("");
  const [milestones, setMilestones] = useState([{ spec: "", amountGen: "0.01", deadlineDays: "30" }]);

  const totalGen = milestones.reduce((s, m) => s + (Number(m.amountGen) || 0), 0);
  const step1Valid = isAddress(builder) && title.trim().length > 0;
  const step2Valid =
    milestones.length > 0 &&
    milestones.every(
      (m) => m.spec.trim().length > 0 && Number(m.amountGen) > 0 && Number(m.deadlineDays) >= 1
    );

  const setMilestone = (i, patch) =>
    setMilestones((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const submit = () => {
    if (!step1Valid || !step2Valid) return;
    const nowSec = Math.floor(Date.now() / 1000);
    onCreate({
      builder,
      title,
      milestones: milestones.map((m) => ({
        ...m,
        deadline: nowSec + Math.max(1, Math.floor(Number(m.deadlineDays) || 30)) * 86400,
      })),
    });
  };

  return (
    <section className="mt-4 rounded-3xl glass p-4 shadow-card sm:p-6">
      <h3 className="font-display text-lg font-bold">New grant</h3>
      <p className="text-sm text-steel">
        Creating a grant costs no GEN — funding locks the escrow afterwards, in a separate step, for the
        exact total below.
      </p>

      {/* Step indicator */}
      <ol className="mt-3 flex items-center gap-2 text-xs font-bold">
        <li className={step === 1 ? "text-acid" : "text-steel"}>
          <span className={`mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full ${step === 1 ? "bg-acid text-acidInk" : "bg-panelStrong text-steel"}`}>
            1
          </span>
          Who &amp; what
        </li>
        <li aria-hidden="true" className="text-steel">→</li>
        <li className={step === 2 ? "text-acid" : "text-steel"}>
          <span className={`mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full ${step === 2 ? "bg-acid text-acidInk" : "bg-panelStrong text-steel"}`}>
            2
          </span>
          Money &amp; deadline
        </li>
      </ol>

      {step === 1 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Builder address
            <input
              value={builder}
              onChange={(e) => setBuilder(e.target.value)}
              placeholder="0x… (40 hex chars)"
              className="glass-input mt-1 w-full rounded-xl px-3 py-2.5 font-mono text-sm font-normal"
            />
            {builder && !isAddress(builder) && (
              <span className="text-xs font-normal text-rose">That is not a valid 0x + 40 hex address.</span>
            )}
          </label>
          <label className="block text-sm font-semibold">
            Grant title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Community dashboard, milestone 1"
              className="glass-input mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-normal"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              onClick={() => step1Valid && setStep(2)}
              disabled={!step1Valid}
              className="btn-primary mt-1 w-full px-5 py-3 text-sm sm:w-auto"
            >
              Continue →
            </button>
            {!step1Valid && (
              <p className="mt-2 text-xs text-steel">
                Add the builder&apos;s wallet address and a title for the grant.
              </p>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">Milestones</p>
          {milestones.map((m, i) => (
            <div key={i} className="mt-2 rounded-2xl border border-line bg-panelInset p-3 sm:p-4">
              <input
                value={m.spec}
                onChange={(e) => setMilestone(i, { spec: e.target.value })}
                placeholder={`Milestone ${i} — what must be delivered`}
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    value={m.amountGen}
                    onChange={(e) => setMilestone(i, { amountGen: e.target.value })}
                    inputMode="decimal"
                    className="glass-input w-28 rounded-xl px-3 py-2.5 text-sm"
                  />
                  GEN
                </label>
                {AMOUNT_CHIPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setMilestone(i, { amountGen: c })}
                    aria-pressed={m.amountGen === c}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                      m.amountGen === c ? "border-acid bg-acid/15 text-acid" : "border-line bg-panel text-steel"
                    }`}
                  >
                    {c} GEN
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    value={m.deadlineDays}
                    onChange={(e) => setMilestone(i, { deadlineDays: e.target.value })}
                    inputMode="numeric"
                    className="glass-input w-20 rounded-xl px-3 py-2.5 text-sm"
                  />
                  days to deadline
                </label>
                {DAYS_CHIPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setMilestone(i, { deadlineDays: c })}
                    aria-pressed={m.deadlineDays === c}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                      m.deadlineDays === c ? "border-acid bg-acid/15 text-acid" : "border-line bg-panel text-steel"
                    }`}
                  >
                    {c} days
                  </button>
                ))}
                {milestones.length > 1 && (
                  <button
                    onClick={() => setMilestones((ms) => ms.filter((_, j) => j !== i))}
                    className="btn-ghost ml-auto px-3 py-2.5 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={() => setMilestones((ms) => [...ms, { spec: "", amountGen: "0.01", deadlineDays: "30" }])}
            className="mt-2 rounded-full border border-acid/50 px-4 py-2.5 text-sm font-semibold text-acid transition hover:bg-mint/10 active:scale-[0.98]"
          >
            + Add milestone
          </button>

          <div className="mt-3 rounded-2xl border border-line bg-panel px-4 py-3 text-sm">
            <p>
              Total escrow — <strong className="text-gradient font-display text-lg">{totalGen} GEN</strong>
            </p>
            <p className="mt-1 text-xs text-steel">
              {milestones.length} {milestones.length === 1 ? "milestone" : "milestones"} · locked when you
              fund
              {walletBalance !== null && walletBalance !== undefined
                ? ` · you hold ${weiToGen(walletBalance)} GEN`
                : ""}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setStep(1)} className="btn-ghost px-5 py-3 text-sm">
              ← Back
            </button>
            <button
              onClick={() => (account ? submit() : onConnect())}
              disabled={busy || (account && !step2Valid)}
              className="btn-primary flex-1 px-5 py-3 text-sm sm:flex-none"
            >
              {busy ? "Creating…" : account ? "Create grant on chain" : "Connect to create"}
            </button>
          </div>
          {account && !step2Valid && (
            <p className="mt-2 text-xs text-steel">
              Fill in every milestone&apos;s spec, amount, and deadline (at least 1 day out). After the
              deadline, an unjudged milestone can be expired and its escrow refunded to the grantor.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
