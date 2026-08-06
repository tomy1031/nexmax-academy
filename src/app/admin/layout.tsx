import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

/**
 * 管理画面の外枠。メニューはここ1か所（サイドバー）。
 *
 * 認可はここでは見ない。ページごとにクライアントで確かめ、実際の関所は
 * API と RLS に置く（設計07 §10.1）——レイアウトで止めると、
 * 「権限が無い」のか「データが無い」のかが画面から分からなくなる。
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="from-bg-sky to-bg-warm min-h-dvh bg-linear-to-b px-3 py-4 sm:px-5">
      <div className="mx-auto flex max-w-[110rem] flex-col gap-4 lg:flex-row">
        <AdminSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
