"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
export function LegacyRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = new URL(to, "https://compat.invalid");
    for (const [key, value] of params) target.searchParams.set(key, value);
    router.replace(target.pathname + target.search);
  }, [router, to]);
  return (
    <p className="empty">
      Opening the new workspace… <Link href={to}>Continue</Link>
    </p>
  );
}
