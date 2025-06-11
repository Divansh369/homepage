// frontend/next.config.js
/** @type {import('next').NextConfig} */
  
const nextConfig = {
  // Add a rewrite to proxy all /api requests to the backend
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:1024'}/api/:path*`,
      },
    ];
  },

  images: {
      remotePatterns: [
        {
          // This allows image loading from your backend server
          protocol: 'http',
          hostname: 'localhost',
          port: '1024',
          pathname: '/**', // Allow any path
        },
        {
          protocol: 'http',
          hostname: '100.94.150.11', // Your specific IP
          port: '1024',
          pathname: '/**',
        },
      ]
  }
};

module.exports = nextConfig;
