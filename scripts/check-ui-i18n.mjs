import fs from "node:fs";

const path="src/lib/i18n/ui-catalog.json";
const catalog=JSON.parse(fs.readFileSync(path,"utf8"));
const errors=[];
const warnings=[];
const norm=value=>String(value??"").replace(/\s+/g," ").trim().toLocaleLowerCase("en-US");

if(catalog.defaultLocale!=="en")errors.push("defaultLocale must remain EN.");
if(JSON.stringify(catalog.locales)!==JSON.stringify(["en","vi"]))errors.push("Supported UI locales must remain [en, vi].");
if(!Array.isArray(catalog.pairs)||!catalog.pairs.length)errors.push("Translation catalog is empty.");

const allEn=new Map();
const allVi=new Map();
const exactEn=new Map();
const exactVi=new Map();
const rowKeys=new Set();
const riskyPhraseTokens=new Set([
 "no","not","has","must","must be","only","only the","need","need to","before","after","when",
 "when changed","when changing","direct","directly","directly affects","handle","processing","not used",
 "do not use","not delete","do not delete","not match","does not match","used for","current logic","change",
 "check","time","allow","list","next","previous","complete","completed","automatic","group","groups",
 "record","records","value","values","schedule"
]);

for(const [index,pair] of (catalog.pairs||[]).entries()){
 const en=String(pair.en||"").trim();
 const vi=String(pair.vi||"").trim();
 const mode=pair.mode||"phrase";
 if(!en||!vi)errors.push(`Pair #${index+1} is missing EN or VI.`);
 if(mode!=="exact"&&mode!=="phrase")errors.push(`Pair #${index+1} has invalid mode: ${mode}`);
 const enKey=norm(en),viKey=norm(vi);
 const rowKey=`${enKey}|${viKey}|${mode}`;
 if(rowKeys.has(rowKey))errors.push(`Duplicate pair row: ${en} ↔ ${vi} [${mode}]`);
 rowKeys.add(rowKey);

 const prevEn=allEn.get(enKey);
 if(prevEn&&norm(prevEn)!==viKey)errors.push(`Conflicting EN translation: ${en} -> ${prevEn} / ${vi}`);
 else allEn.set(enKey,vi);
 const prevVi=allVi.get(viKey);
 if(prevVi&&norm(prevVi)!==enKey)errors.push(`Conflicting VI reverse translation: ${vi} -> ${prevVi} / ${en}`);
 else allVi.set(viKey,en);

 if(mode==="exact"){
  const e=exactEn.get(enKey); if(e&&norm(e)!==viKey)errors.push(`Conflicting exact EN translation: ${en}`); else exactEn.set(enKey,vi);
  const v=exactVi.get(viKey); if(v&&norm(v)!==enKey)errors.push(`Conflicting exact VI translation: ${vi}`); else exactVi.set(viKey,en);
 }
 if(mode==="phrase"&&riskyPhraseTokens.has(enKey))errors.push(`Risky grammar fragment must be exact-only: ${en}`);
}

const required={
 "Operations":"Vận hành","Tracking":"Theo dõi","Administration":"Quản trị","Configuration":"Cấu hình",
 "Scheduling Board":"Bảng điều độ","Planning Board":"Planning Board","Process Time":"Thời gian xử lý",
 "Search":"Tìm kiếm","Save":"Lưu","Cancel":"Hủy","Actions":"Thao tác","Status":"Trạng thái","Priority":"Ưu tiên",
 "Users & Permissions":"Người dùng & Phân quyền","New User Training":"Đào tạo người mới",
 "Daily Production Adjustment":"Điều chỉnh đầu ngày","Production Change Alerts":"Cảnh báo thay đổi sản xuất",
 "Sign in":"Đăng nhập","Password":"Mật khẩu"
};
for(const [en,vi] of Object.entries(required)){
 const got=allEn.get(norm(en));
 if(!got)errors.push(`Missing required UI pair: ${en}`);
 else if(norm(got)!==norm(vi))errors.push(`Unexpected VI for ${en}: ${got} (expected ${vi})`);
}

const forbiddenViFragments=[
 "Board Điều Độ","Thời gian Process","Công thức & Rule","Issues cần xử lý","Kiểm tra Compatibility",
 "Nhập Start","Tính Duration","Kiểm tra overlap","dependency tổng thể","Source of truth","issue cấu hình",
 "Flow dữ liệu","reload toàn"
];
for(const pair of catalog.pairs||[]){
 for(const fragment of forbiddenViFragments){
  if(String(pair.vi).toLocaleLowerCase("vi-VN").includes(fragment.toLocaleLowerCase("vi-VN")))
   errors.push(`Obsolete/mixed VI wording remains: "${fragment}" in EN="${pair.en}"`);
 }
}

// Critical canonical-source files should stay EN-first. DOM i18n then renders VI from the catalog.
const criticalSourceChecks={
 "src/lib/erp/st-navigation.ts":["Board Điều Độ","Vận hành","Theo dõi","Quản trị","Cấu hình","Training người mới","Cảnh báo thay đổi SX"],
 "src/components/login-form.tsx":["Đăng nhập bằng tài khoản","Đang đăng nhập"],
};
for(const [file,badFragments] of Object.entries(criticalSourceChecks)){
 if(!fs.existsSync(file))continue;
 const text=fs.readFileSync(file,"utf8");
 for(const fragment of badFragments)if(text.includes(fragment))errors.push(`Critical EN-first source still contains legacy VI text in ${file}: ${fragment}`);
}

if(errors.length){
 console.error("UI i18n check FAILED");
 for(const e of [...new Set(errors)])console.error(`- ${e}`);
 process.exit(1);
}
console.log(`UI i18n check OK · ${catalog.pairs.length} EN/VI pairs · 0 EN conflicts · 0 VI reverse conflicts · risky phrase guard OK · default EN.`);
if(warnings.length)for(const w of warnings)console.warn(`WARN: ${w}`);
