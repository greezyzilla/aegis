interface Props {
  title: string;
  description: string;
  sites: string[];
  onRemove: (site: string) => void;
}

export function SiteList({ title, description, sites, onRemove }: Props) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      {sites.length === 0 ? (
        <p className="empty muted">Kosong. Atur dari popup di situs terkait.</p>
      ) : (
        <ul className="chips" role="list">
          {sites.map((s) => (
            <li key={s} className="chip">
              <span className="mono">{s}</span>
              <button type="button" className="chip-remove" onClick={() => onRemove(s)} aria-label={`Hapus ${s}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
