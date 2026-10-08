import type { NextConfig } from "next";
const pages = process.env.GITHUB_PAGES === "true";
const config: NextConfig = {
  poweredByHeader: false,
  ...(pages
    ? {
        output: "export",
        basePath: "/tempo-payment-finance",
        trailingSlash: true,
      }
    : {}),
};
export default config;
