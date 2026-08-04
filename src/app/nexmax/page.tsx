import type { Metadata } from "next";
import { NexMaxCatalog } from "@/components/nexmax-catalog";

export const metadata: Metadata = {
  title: "ネクマックス 16人 | Nexmax Academy",
};

/** ネクマックス図鑑。ログイン不要で見られる（診断前でも世界観に触れられるようにする）。 */
export default function NexMaxPage() {
  return <NexMaxCatalog />;
}
