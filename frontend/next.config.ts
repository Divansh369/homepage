import type { NextConfig } from "next";

export const nextConfig: NextConfig = {
    allowedDevOrigins: ["http://", "http://localhost", "http://127.0.0.1", "*.local-origin.dev","vivo"],
    images: {
        remotePatterns: [
          {
            protocol: 'http', // Or 'https' if your backend serves icons over HTTPS
            hostname: '', // The HOSTNAME or IP of your backend server
            port: '1024', // The PORT of your backend server
            pathname: '/project_icons/**', // Allow any path under /project_icons
          },]
}};
