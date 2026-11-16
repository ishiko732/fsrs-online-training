import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Server uses the native binding; the browser worker uses threadless
  // wasm32-wasip1, so cross-origin isolation (COOP/COEP) is unnecessary.
  serverExternalPackages: ['@open-spaced-repetition/binding'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'cross-origin',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, OPTIONS, POST',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type',
          },
        ],
      },
    ]
  },
}

export default nextConfig
