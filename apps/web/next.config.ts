import type { NextConfig } from "next";
import path from "node:path";
const nextConfig: NextConfig = {
  transpilePackages: ["@blackbox/agent", "@blackbox/graph"],
  serverExternalPackages: ["falkordb"], // Node client (redis sockets), load at runtime, not bundled
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
};
export default nextConfig;
