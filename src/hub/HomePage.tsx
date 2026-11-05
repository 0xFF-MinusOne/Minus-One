import { ArrowUpRight } from "lucide-react";
import { products } from "../products";

const NAV = [
  { href: "#top", label: "ホーム" },
  { href: "#apps", label: "アプリ" },
  { href: "#research", label: "研究" },
  { href: "#members", label: "メンバー" },
  { href: "#about", label: "組織について" },
];

const TILES = [
  { href: "#research", label: "研究" },
  { href: "#advisories", label: "アドバイザリ" },
  { href: "#open-source", label: "オープンソース" },
];

const UPCOMING = [
  { id: "research", title: "研究" },
  { id: "advisories", title: "アドバイザリ" },
  { id: "open-source", title: "オープンソース" },
  { id: "members", title: "メンバー" },
  { id: "about", title: "組織について" },
];

const serif = { fontFamily: "'Hiragino Mincho ProN', Georgia, 'Times New Roman', serif" };

const App = () => (
  <div id="top" className="min-h-screen bg-black text-white antialiased" style={serif}>
    <header className="mx-auto max-w-[1440px] px-6 sm:px-12">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-white/40 py-6">
        <a href="#top" className="flex items-center gap-5" aria-label="MINUS ONE ホーム">
          <img src="/brand/0xff-mark.png" alt="" className="h-16 w-16 object-contain mix-blend-screen" />
          <span className="hidden h-12 w-px bg-white/30 sm:block" />
          <span className="text-xl tracking-[0.3em] sm:text-2xl">MINUS ONE</span>
        </a>
        <nav className="flex flex-wrap gap-x-7 gap-y-2 text-base sm:gap-x-10">
          {NAV.map((item, i) => (
            <a key={item.href} href={item.href} className={i === 0 ? "border-b border-white pb-2" : "pb-2 text-white/85 hover:text-white"}>{item.label}</a>
          ))}
        </nav>
      </div>
    </header>

    <main className="mx-auto max-w-[1440px] px-6 sm:px-12">
      <section className="relative overflow-hidden pb-16 pt-14 sm:pt-20">
        <svg className="pointer-events-none absolute -right-10 top-10 hidden h-[560px] w-[760px] lg:block" viewBox="0 0 760 560" aria-hidden="true">
          <defs>
            <linearGradient id="hero-wall" x1="0" y1="0" x2="1" y2="0.25"><stop offset="0" stopColor="#8a8a8a" /><stop offset="0.3" stopColor="#2b2b2b" /><stop offset="0.72" stopColor="#000" /></linearGradient>
            <linearGradient id="hero-floor" x1="0.55" y1="0.3" x2="0.75" y2="0.95"><stop offset="0" stopColor="#333" /><stop offset="0.75" stopColor="#000" /></linearGradient>
            <linearGradient id="hero-edge" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#000" /><stop offset="0.45" stopColor="#d4d4d4" /><stop offset="0.95" stopColor="#000" /></linearGradient>
          </defs>
          <path d="M360 130 L760 -70 L760 190 L360 390 Z" fill="url(#hero-wall)" />
          <path d="M20 560 L760 190 L760 560 Z" fill="url(#hero-floor)" />
          <path d="M20 560 L760 190" stroke="url(#hero-edge)" strokeWidth="1.5" />
          <path d="M360 130 L560 30" stroke="#8a8a8a" strokeWidth="1" />
        </svg>
        <div className="relative">
          <h1 className="text-6xl leading-[1.08] sm:text-7xl lg:text-8xl">Below Zero.<br /><span className="ml-[0.45em]">Beyond Trust.</span></h1>
          <div className="mt-12 h-px w-24 bg-white/70" />
          <p className="mt-10 max-w-3xl text-lg leading-relaxed text-white/85 sm:text-xl">脆弱性研究・リバースエンジニアリング・バイナリ解析を通じて、ソフトウェアセキュリティの境界を探究します。</p>
        </div>
        <div className="relative mt-16 grid gap-6 md:grid-cols-3">
          {TILES.map(tile => (
            <a key={tile.href} href={tile.href} className="flex items-center gap-5 border border-white/40 bg-black/40 px-8 py-7 tracking-[0.2em] transition-colors hover:border-white hover:bg-white/5">
              <span className="text-white/60">/</span>
              <span className="flex-1 uppercase">{tile.label}</span>
              <ArrowUpRight className="h-5 w-5" strokeWidth={1.25} />
            </a>
          ))}
        </div>
      </section>

      <section id="apps" className="scroll-mt-6 border-t border-white/30 py-16">
        <p className="text-xs tracking-[0.3em] text-white/70">APPLICATIONS</p>
        <h2 className="mt-4 text-4xl sm:text-5xl">アプリ一覧</h2>
        <p className="mt-4 text-white/70">既存の実績を確認する、新しい案件を進める。目的に合わせてアプリを選択してください。</p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {products.map(product => {
            const body = (
              <>
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-2xl">{product.name}</h3>
                  {product.url && <ArrowUpRight className="mt-1 h-6 w-6 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={1.25} />}
                </div>
                <p className="mt-1 text-xs tracking-[0.2em] text-white/60">{product.category}</p>
                <p className="mt-5 flex-1 leading-relaxed text-white/80">{product.description}</p>
                <span className="mt-7 border-t border-white/20 pt-4 text-sm tracking-[0.2em]">{!product.url ? "準備中" : product.external ? "新しいタブで開く" : "開く"}</span>
              </>
            );
            return product.url
              ? <a key={product.id} href={product.url} {...(product.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="group flex flex-col border border-white/40 p-7 transition-colors hover:border-white hover:bg-white/5">{body}</a>
              : <article key={product.id} className="flex flex-col border border-white/40 p-7">{body}</article>;
          })}
        </div>
      </section>

      {UPCOMING.map(section => (
        <section key={section.id} id={section.id} className="scroll-mt-6 flex items-baseline justify-between gap-6 border-t border-white/20 py-8">
          <h2 className="text-2xl">{section.title}</h2>
          <p className="text-sm text-white/60">準備中</p>
        </section>
      ))}
    </main>

    <footer className="mx-auto max-w-[1440px] px-6 py-10 text-sm tracking-[0.2em] text-white/50 sm:px-12">0xFF MINUS ONE</footer>
  </div>
);

export default App;
