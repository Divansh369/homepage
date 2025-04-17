import type { NextConfig } from "next";

export const nextConfig: NextConfig = {
    allowedDevOrigins: ["http://100.94.150.11", "http://localhost", "http://127.0.0.1", "*.local-origin.dev","vivo"],
    images: {
        remotePatterns: [
          {
            protocol: 'http', // Or 'https' if your backend serves icons over HTTPS
            hostname: '100.94.150.11','vivo', // The HOSTNAME or IP of your backend server
            port: '3001', // The PORT of your backend server
            pathname: '/project_icons/**', // Allow any path under /project_icons
          },]
}};
