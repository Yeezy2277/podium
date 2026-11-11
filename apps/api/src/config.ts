/**
 * Env flags, read tolerantly: dashboards make it easy to save `"true"` with
 * quotes or a trailing space, and a flag that silently reads as off is a
 * confusing way to lose an afternoon.
 */
export function flag(name: string): boolean {
  const v = process.env[name]?.trim().replace(/^["']|["']$/g, "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export const demoLoginEnabled = () => flag("DEMO_LOGIN");
