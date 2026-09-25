import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // The parent CRM folder has its own package-lock.json — pin the root to this project.
    root: path.join(__dirname),
  },
};

export default nextConfig;
