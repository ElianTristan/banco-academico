export function PortalLoading(){
  return <main className="portal-loading" aria-label="Cargando espacio académico" aria-busy="true">
    <aside className="portal-loading-rail"><i/><i/><i/><i/><i/></aside>
    <section className="portal-loading-content"><div className="skeleton skeleton-kicker"/><div className="skeleton skeleton-title"/><div className="skeleton skeleton-copy"/><div className="skeleton-grid">{Array.from({length:4},(_,index)=><div className="skeleton-card" key={index}><i className="skeleton skeleton-label"/><i className="skeleton skeleton-value"/></div>)}</div><div className="skeleton-panels"><div className="skeleton-card skeleton-panel"/><div className="skeleton-card skeleton-panel"/></div></section>
  </main>;
}
