import Link from "next/link";
import { Header } from "@/components/navigation/Header";
import { Compass, FileText, Terminal, Network, Users, Settings } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <Header />

      {/* Admin Subheader Navigation */}
      <div className="border-b border-rule bg-paper-dim">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-12">
          <div className="flex items-center gap-8 text-xs font-mono">
            <Link
              href="/admin/dashboard"
              className="flex items-center gap-1.5 text-ink hover:text-index-red py-3 border-b-2 border-transparent hover:border-index-red transition-all"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Overview & Analytics</span>
            </Link>

            <Link
              href="/admin/documents"
              className="flex items-center gap-1.5 text-ink hover:text-index-red py-3 border-b-2 border-transparent hover:border-index-red transition-all"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Document Catalog</span>
            </Link>

            <Link
              href="/admin/traces"
              className="flex items-center gap-1.5 text-ink hover:text-index-red py-3 border-b-2 border-transparent hover:border-index-red transition-all"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Trace Explorer</span>
            </Link>

            <Link
              href="/admin/graph"
              className="flex items-center gap-1.5 text-ink hover:text-index-red py-3 border-b-2 border-transparent hover:border-index-red transition-all"
            >
              <Network className="w-3.5 h-3.5" />
              <span>Knowledge Graph</span>
            </Link>
          </div>

          <div className="text-xs font-mono text-ink/60 flex items-center gap-2">
            <span>Workspace: <strong>Acme Research Labs</strong></span>
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-7xl w-full mx-auto p-6">{children}</div>
    </div>
  );
}
