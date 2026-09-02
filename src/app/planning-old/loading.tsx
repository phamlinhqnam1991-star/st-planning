export default function Loading(){
 return <main className="erp-shell">
  <header className="erp-header">
   <div><h1>ST Planning</h1></div>
   <div className="erp-env">PLANNING BOARD</div>
  </header>
  <section className="erp-content erp-content-full planning-page planning-candidate-page">
   <div className="erp-page-head"><div><h2>Planning Board</h2><p>Đang mở Planning Board…</p></div></div>
   <div className="erp-form-panel planning-filter" aria-busy="true">
    <div className="planning-load-skeleton">Đang tải bộ lọc Planning…</div>
   </div>
   <div className="section notice">Đang chuẩn bị Candidate Jobs…</div>
  </section>
 </main>;
}
