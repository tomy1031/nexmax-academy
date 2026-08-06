import { permanentRedirect } from "next/navigation";

/**
 * スタジオは管理画面に統合した（/admin/stages）。
 * 古いURLを 404 にせず、いまの場所へ送る。
 */
export const dynamic = "force-static";

export default function StudioPage() {
  permanentRedirect("/admin/stages");
}
