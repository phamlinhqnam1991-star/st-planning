import type {MissingGroup,MissingRow} from "@/lib/planning/missing-config-jobs";

/**
 * Cảnh báo Job đang mở nhưng không hiện trên Planning Board
 * (NextOperation chưa khai báo/mapping hoặc chain chưa dựng lại).
 */
export function MissingJobsPanel({total,groups,rows}:{
 total:number;groups:MissingGroup[];rows:MissingRow[];
}){
 if(!total)return null;
 return (
  <div className="erp-table-panel section missing-jobs-panel" id="missing-jobs">
   <div className="erp-panel-head">
    <div>
     <b>⚠ {total} Job đang mở nhưng KHÔNG hiện trên bảng (chưa cấu hình ST)</b>
     <small className="planning-sub">
      NextOperation của các Job này chưa khai báo/mapping ST hoặc chain chưa dựng lại
      → không có dòng "Sẵn sàng" (ELIGIBLE) nên bảng không hiển thị.
     </small>
    </div>
   </div>

   <div className="missing-groups">
    {groups.map(g=>(
     <span key={g.ly_do} className="missing-chip">
      <b>{g.so_job}</b> {String(g.ly_do).replace(/^\d+\.\s*/,"")}
     </span>
    ))}
   </div>

   <details className="missing-details">
    <summary>Xem danh sách chi tiết ({rows.length} Job)</summary>
    <div className="table-wrap" style={{maxHeight:360}}>
     <table className="erp-table">
      <thead>
       <tr>
        <th>Job</th><th>Part</th><th>NextOperation</th><th>LastLaborOp</th>
        <th className="num">Số lượng</th><th>Lý do</th><th className="num">Số dòng chain</th>
       </tr>
      </thead>
      <tbody>
       {rows.map(r=><tr key={r.job_num}>
        <td><b>{r.job_num}</b></td>
        <td>{r.part_num||"—"}</td>
        <td><b>{r.next_operation||"—"}</b></td>
        <td>{r.last_operation||"—"}</td>
        <td className="num mono">{Number(r.so_luong||0).toLocaleString("vi-VN")}</td>
        <td><span className="missing-reason">{String(r.ly_do).replace(/^\d+\.\s*/,"")}</span></td>
        <td className="num">{r.so_dong_chain}</td>
       </tr>)}
      </tbody>
     </table>
    </div>
   </details>

   <small className="muted" style={{display:"block",marginTop:8}}>
    💡 Sau khi sửa cấu hình ST (khai báo/mapping), mở Planning Board và bấm <b>Rebuild Chain</b> để các Job này xuất hiện trở lại. Xem thêm hướng dẫn trong Cấu hình → Tổng quan.
   </small>
  </div>
 );
}
