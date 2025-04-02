import type { NextConfig } from "next";

export const nextConfig: NextConfig = {
    allowedDevOrigins: ["http://100.114.43.102", "http://localhost", "http://127.0.0.1", "*.local-origin.dev"],
};
