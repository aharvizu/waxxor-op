"use client";

import { buttonSecondaryClass } from "./ui";

export function PrintButton({ label = "Print / PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonSecondaryClass}>
      {label}
    </button>
  );
}
