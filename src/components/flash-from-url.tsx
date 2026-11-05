"use client";

import { useSearchParams } from "next/navigation";
import { Flash } from "./ui";

export function FlashFromUrl() {
  const p = useSearchParams();
  return <Flash ok={p.get("ok") ?? undefined} err={p.get("err") ?? undefined} />;
}
