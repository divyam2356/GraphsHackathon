import type { NextConfig } from "next";
import path from "node:path";
const nextConfig: NextConfig = {
  devIndicators: false, // clean screenshots and recordings
  transpilePackages: ["@blackbox/agent", "@blackbox/graph"],
  serverExternalPackages: ["falkordb", "@modelcontextprotocol/sdk"], // Node-only clients (sockets, child processes): load at runtime, not bundled
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
};
export default nextConfig;
