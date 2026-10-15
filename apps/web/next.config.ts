import type { NextConfig } from "next";
import path from "node:path";
const nextConfig: NextConfig = {
  transpilePackages: ["@blackbox/agent", "@blackbox/graph"],
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
};
export default nextConfig;
