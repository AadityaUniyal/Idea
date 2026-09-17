import Link from "next/link";
import { BookOpen, ShieldCheck, Terminal, Compass, ArrowRight } from "lucide-react";

export function Header() {
  return (
    <header className="border-b border-rule bg-paper/95 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="w-4 h-4 rounded-sm bg-index-red inline-block transition-transform group-hover:scale-110" />
            <span className="font-serif text-2xl font-bold tracking-tight text-ink">
              DocMind
            </span>
          </Link>
          <span className="text-xs font-mono uppercase tracking-widest text-ink/40 border border-rule px-2 py-0.5 rounded">
            v2.0 Advanced
          </span>
        </div>

        <nav className="flex items-center gap-6 text-sm">
          <Link
            href="/chat"
            className="flex items-center gap-1.5 text-ink/80 hover:text-index-red font-medium transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            <span>Archive Search</span>
          </Link>

          <Link
            href="/admin/dashboard"
            className="flex items-center gap-1.5 text-ink/80 hover:text-index-red font-medium transition-colors"
          >
            <Compass className="w-4 h-4" />
            <span>Admin Console</span>
          </Link>

          <Link
            href="/admin/traces"
            className="flex items-center gap-1.5 text-ink/80 hover:text-index-red font-medium transition-colors"
          >
            <Terminal className="w-4 h-4" />
            <span>Trace Explorer</span>
          </Link>

          <Link
            href="/chat"
            className="ml-2 inline-flex items-center gap-1.5 bg-ink text-paper px-4 py-2 rounded text-xs font-mono font-medium hover:bg-index-red transition-colors"
          >
            <span>Ask Archive</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
