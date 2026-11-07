"use client";
import { useOptimistic, useTransition } from "react";
import { updateStatus } from "@/app/actions";

const OPTIONS = ["to apply", "applied", "interview", "offer", "rejected", "skipped", "REMOVED"];
const cls = (s: string) => "s-" + s.toLowerCase().replace(/\s+/g, "-");

export default function StatusSelect({ date, folder, status }: { date: string; folder: string; status: string }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(status);
  return (
    <select
      className={`select ${cls(value)}`}
      value={value}
      disabled={pending}
      aria-label="Application status"
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          setValue(next);
          await updateStatus(date, folder, next);
        });
      }}
    >
      {(OPTIONS.includes(value) ? OPTIONS : [value, ...OPTIONS]).map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
