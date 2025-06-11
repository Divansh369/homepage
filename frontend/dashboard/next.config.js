// frontend/next.config.js
/** @type {import('next').NextConfig} */
  
const nextConfig = {
  // Add a rewrite to proxy all API requests AND asset requests to the backend
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:1024';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      // --- THE FIX: Add proxy rules for asset paths ---
      {
        source: '/project_icons/:path*',
        destination: `${backendUrl}/project_icons/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${backendUrl}/uploads/:path*`,
      }
      // --- END FIX ---
    ];
  },

  // The 'images' remotePatterns is NO LONGER NEEDED with the proxy in place
  images: {}, 
};

module.exports = nextConfig;
