// Failed-operator-action banner. Rendered when a page is loaded with
// `?opError=` — i.e. a Pause / Resume / Kill / Run POST to Oracle came back
// non-2xx or never landed. Before this, those actions redirected regardless of
// the response, so a failed containment action was indistinguishable from a
// successful one.
//
// Deliberately loud but in-idiom: same red-on-dark treatment as the `killed`
// status chip and the over-budget bar, plus a left rule so it reads as an
// interruption rather than another card in the stack. The raw Oracle message is
// monospaced — it's diagnostic text, not prose, and the operator will paste it.
//
// Pure display component; the page supplies the message.

export function OpErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-500/20 border-l-2 border-l-red-500 bg-red-500/[0.07] px-4 py-3"
    >
      <span
        aria-hidden
        className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-[10px] font-bold text-red-400"
      >
        !
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
          Action failed — nothing changed
        </p>
        <p className="mt-1 break-words font-mono text-xs leading-relaxed text-red-300/80">{message}</p>
      </div>
    </div>
  );
}
