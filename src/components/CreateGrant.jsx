import React, { useState } from "react";
import { weiToGen } from "../lib/genlayer.js";

function isAddress(v) {
  return /^0x[0-9a-fA-F]{40}$/.test(v.trim());
}

export default function CreateGrant({ onCreate, busy, account, onConnect }) {
  const [builder, setBuilder] = useState("");
  const [title, setTitle] = useState("");
  const [milestones, setMilestones] = useState([{ spec: "", amountGen: "0.01", deadlineDays: "30" }]);

  const totalGen = milestones.reduce((s, m) => s + (Number(m.amountGen) || 0), 0);
  const valid =
    isAddress(builder) &&
    title.trim().length > 0 &&
    milestones.length > 0 &&
    milestones.every(
      (m) => m.spec.trim().length > 0 && Number(m.amountGen) > 0 && Number(m.deadlineDays) >= 1
    );

  const setMilestone = (i, patch) =>
    setMilestones((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const submit = () => {
    if (!valid) return;
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
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
      </div>

      <div className="mt-4">
        <p className="text-sm font-semibold">Milestones</p>
        {milestones.map((m, i) => (
          <div key={i} className="mt-2 flex flex-col gap-2 rounded-2xl border border-line bg-panelInset p-3 sm:flex-row sm:items-center sm:p-4">
            <input
              value={m.spec}
              onChange={(e) => setMilestone(i, { spec: e.target.value })}
              placeholder={`Milestone ${i} — what must be delivered`}
              className="glass-input flex-1 rounded-xl px-3 py-2.5 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                value={m.amountGen}
                onChange={(e) => setMilestone(i, { amountGen: e.target.value })}
                inputMode="decimal"
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm sm:w-28"
              />
              GEN
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                value={m.deadlineDays}
                onChange={(e) => setMilestone(i, { deadlineDays: e.target.value })}
                inputMode="numeric"
                className="glass-input w-full rounded-xl px-3 py-2.5 text-sm sm:w-20"
              />
              days to deadline
            </label>
            {milestones.length > 1 && (
              <button
                onClick={() => setMilestones((ms) => ms.filter((_, j) => j !== i))}
                className="btn-ghost px-3 py-2.5 text-sm"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setMilestones((ms) => [...ms, { spec: "", amountGen: "0.01", deadlineDays: "30" }])}
          className="mt-2 rounded-full border border-acid/50 px-4 py-2.5 text-sm font-semibold text-acid transition hover:bg-mint/10 active:scale-[0.98]"
        >
          + Add milestone
        </button>
        <p className="mt-2 text-sm">
          Total escrow to fund: <strong className="text-gradient font-display text-lg">{totalGen} GEN</strong>
        </p>
      </div>

      <button
        onClick={() => (account ? submit() : onConnect())}
        disabled={busy || (account && !valid)}
        className="btn-primary mt-4 w-full px-5 py-3 text-sm sm:w-auto"
      >
        {busy ? "Creating…" : account ? "Create grant on chain" : "Connect wallet to create"}
      </button>
      {account && !valid && (
        <p className="mt-2 text-xs text-steel">
          Fill in a valid builder address, a title, and every milestone&apos;s spec, amount, and deadline
          (at least 1 day out). After the deadline, an unjudged milestone can be expired and its escrow
          refunded to the grantor.
        </p>
      )}
    </section>
  );
}
