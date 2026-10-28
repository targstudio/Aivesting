/** Aparece na hora do clique enquanto a página busca os dados na API (que pode estar acordando). */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Carregando">
      <div className="mb-3 mt-2 h-4 w-32 rounded bg-track" />
      <div className="mb-6 h-8 w-72 rounded bg-track" />
      <div className="mb-6 h-16 rounded-card bg-track" />
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-card border border-border bg-surface" />
        ))}
      </div>
    </div>
  );
}
