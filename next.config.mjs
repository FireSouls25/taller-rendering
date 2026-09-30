/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow async WebAssembly so the Rust physics engine can load client-side.
  webpack(config) {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};

export default nextConfig;
