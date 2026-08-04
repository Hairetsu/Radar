export function RendererBootstrapError({ message }: { message: string }) {
  return (
    <main className="radar-shell grid h-full place-items-center bg-ink p-8 text-copy" data-testid="rendererBootstrapError">
      <section className="max-w-2xl border border-rust/45 bg-surface/65 p-6 shadow-bureau">
        <span className="rd-eyebrow text-rust">Fail-closed renderer boundary</span>
        <h1 className="mt-3 font-display text-hero uppercase tracking-key text-bone">Surface role mismatch</h1>
        <p className="mt-3 text-body leading-6 text-muted">{message}</p>
      </section>
    </main>
  );
}

