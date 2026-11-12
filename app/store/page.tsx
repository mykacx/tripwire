import type { Metadata } from "next";
import Storefront from "@/components/Storefront";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Northwind Gadgets — Tripwire demo store" };

export default function StorePage() {
  return <Storefront paypalClientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""} />;
}
