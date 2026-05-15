// StatusBar — bottom strip showing connection, mode, embedder info, chunk count.

function StatusBar({ totalMs, mode, results }) {
  const T = useT();
  return (
    <div className="statusbar">
      <span className="item"><span className="ok">●</span> {T('sb_connected')}</span>
      <span className="item">{T('sb_mode')} {mode}</span>
      <span className="item">{T('sb_embedder')}</span>
      <span className="item">{T('sb_alpha')}</span>
      <span className="spacer"></span>
      <span className="item">{T('sb_cache')}</span>
      <span className="item">{results.length} {T('sb_chunks')} · {totalMs}ms</span>
    </div>
  );
}
