import React, { useState } from "react";
import { weiToGen } from "../lib/genlayer.js";

function isAddress(v) {
  return /^0x[0-9a-fA-F]{40}$/.test(v.trim());
}

export default function CreateGrant({ onCreate, busy, account, onConnect }) {
  const [builder, setBuilder] = useState("");
  const [title, setTitle] = useState("");
  const [milestones, setMilestones] = useState([{ spec: "", amountGen: "0.01" }]);

  const totalGen = milestones.reduce((s, m) => s + (Number(m.amountGen) || 0), 0);
  const valid =
    isAddress(builder) &&
    title.trim().length > 0 &&
    milestones.length > 0 &&
    milestones.every((m) => m.spec.trim().length > 0 && Number(m.amountGen) > 0);

  const setMilestone = (i, patch) =>
    setMilestones((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const submit = () => {
    if (!valid) return;
    onCreate({ builder, title, milestones });
  };

  return (
    <section className="mt-4 rounded-lg border border-rule bg-paper p-4">
      <h3 className="font-display text-lg font-bold">New grant</h3>
      <p className="text-sm text-inksoft">
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
            className="mt-1 w-full rounded border border-rule bg-paper2 px-3 py-2 font-mono text-sm font-normal"
          />
          {builder && !isAddress(builder) && (
            <span className="text-xs font-normal text-red-700">That is not a valid 0x + 40 hex address.</span>
          )}
        </label>
        <label className="block text-sm font-semibold">
          Grant title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Community dashboard, milestone 1"
            className="mt-1 w-full rounded border border-rule bg-paper2 px-3 py-2 text-sm font-normal"
          />
        </label>
      </div>

      <div className="mt-4">
        <p className="text-sm font-semibold">Milestones</p>
        {milestones.map((m, i) => (
          <div key={i} className="mt-2 flex flex-col gap-2 rounded border border-rule bg-paper2 p-3 sm:flex-row">
            <input
              value={m.spec}
              onChange={(e) => setMilestone(i, { spec: e.target.value })}
              placeholder={`Milestone ${i} — what must be delivered`}
              className="flex-1 rounded border border-rule bg-paper px-3 py-2 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                value={m.amountGen}
                onChange={(e) => setMilestone(i, { amountGen: e.target.value })}
                inputMode="decimal"
                className="w-28 rounded border border-rule bg-paper px-3 py-2 text-sm"
              />
              GEN
            </label>
            {milestones.length > 1 && (
              <button
                onClick={() => setMilestones((ms) => ms.filter((_, j) => j !== i))}
                className="rounded border border-rule px-3 py-2 text-sm"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setMilestones((ms) => [...ms, { spec: "", amountGen: "0.01" }])}
          className="mt-2 rounded border border-pine px-3 py-2 text-sm font-semibold text-pine"
        >
          + Add milestone
        </button>
        <p className="mt-2 text-sm">
          Total escrow to fund: <strong>{totalGen} GEN</strong>
        </p>
      </div>

      <button
        onClick={() => (account ? submit() : onConnect())}
        disabled={busy || (account && !valid)}
        className="mt-4 rounded bg-pine px-4 py-2 text-sm font-semibold text-white hover:bg-pinebright disabled:opacity-50"
      >
        {busy ? "Creating…" : account ? "Create grant on chain" : "Connect wallet to create"}
      </button>
      {account && !valid && (
        <p className="mt-2 text-xs text-inksoft">
          Fill in a valid builder address, a title, and every milestone&apos;s spec and amount.
        </p>
      )}
    </section>
  );
}
