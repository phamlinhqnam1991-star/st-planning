import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["exceljs", "pg"],
  // Giữ Turbopack trong đúng project hiện tại, tránh Next.js tự suy ra
  // workspace root từ package-lock.json nằm ở thư mục cha (ví dụ D:\\package-lock.json).
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
