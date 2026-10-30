/**
 * The shell for anything meant to come out of a printer.
 *
 * Deliberately not the app's own layout: the navigation, the course breadcrumb
 * and the avatar menu are the first thing on every printed page otherwise, and
 * `print:hidden` on all of it would mean the chrome still decides the width and
 * the background of a document somebody is going to send to a coach. A route
 * group of its own is the cheap way to have no chrome at all.
 *
 * Access is each page's own job, as it is everywhere else — this renders a
 * document, it does not decide who may read one.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-ink-100 py-8 print:bg-white print:py-0">{children}</div>;
}
