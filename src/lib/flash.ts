import { redirect } from "next/navigation";

/** Redirects back to a page with a success or error banner (shown by the app shell). */
export function flash(path: string, message: { ok?: string; err?: string }): never {
  const url = new URL(path, "http://x");
  if (message.ok) url.searchParams.set("ok", message.ok);
  if (message.err) url.searchParams.set("err", message.err);
  redirect(url.pathname + url.search);
}
