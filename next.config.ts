import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "crawler-game";
const pagesBasePath = isGitHubPages ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  output: isGitHubPages ? "export" : undefined,
  basePath: pagesBasePath,
  assetPrefix: pagesBasePath,
  images: { unoptimized: true },
};

export default nextConfig;
