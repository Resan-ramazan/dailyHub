import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dashboard only ever runs locally on 127.0.0.1.
  poweredByHeader: false,
  // Job Radar moved under /jobs; keep old bookmarks working.
  async redirects() {
    return [
      { source: "/pipeline", destination: "/jobs/pipeline", permanent: false },
      { source: "/day/:date", destination: "/jobs/day/:date", permanent: false },
      { source: "/job/:date/:folder", destination: "/jobs/job/:date/:folder", permanent: false },
    ];
  },
};

export default nextConfig;
