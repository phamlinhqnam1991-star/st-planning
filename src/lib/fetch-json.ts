// =====================================================================
// v276: đọc JSON an toàn cho mọi fetch ở client.
// Máy chủ đôi khi trả về TRANG HTML thay vì JSON (route chạy quá lâu bị
// cắt trên Vercel, route lỗi 500/404) → JSON.parse văng lỗi khó hiểu
// "Unexpected token '<' ... is not valid JSON".
// Hàm này: nếu body là JSON → trả về như cũ (caller tự xử lý r.ok);
// nếu body KHÔNG phải JSON → ném lỗi tiếng Việt rõ ràng kèm HTTP status.
// =====================================================================
export async function safeJson<T=any>(r:Response):Promise<T>{
  const text=await r.text();
  try{
    return JSON.parse(text) as T;
  }catch{
    throw new Error(
      r.ok
        ? "Máy chủ trả về nội dung không phải JSON."
        : `Máy chủ trả về trang lỗi thay vì dữ liệu (HTTP ${r.status}) — `+
          `thường do route chạy quá lâu bị cắt (giới hạn thời gian Vercel) `+
          `hoặc route lỗi. Hãy thử lại; nếu là Rebuild Chain / Import mà vẫn lỗi → báo trợ lý.`
    );
  }
}
