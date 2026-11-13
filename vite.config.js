import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api/explorer proxies to the Bradbury explorer API (see vercel.json).
// The explorer API sends no CORS headers, so the dApp must call it
// same-origin — in production the Vercel rewrite does this. Locally, the
// vite http-proxy cannot chain through this VM's egress proxy, so a small
// middleware forwards with node fetch instead (which honours the env proxy).
function explorerMiddleware() {
  return async (req, res, next) => {
    if (!req.url || !req.url.startsWith("/api/explorer")) return next();
    const upstream =
      "https://scan.bradbury.genlayer.com/api/v1" + req.url.slice("/api/explorer".length);
    try {
      const r = await fetch(upstream, { headers: { accept: "application/json" } });
      const body = await r.arrayBuffer();
      res.writeHead(r.status, {
        "content-type": r.headers.get("content-type") || "application/json",
      });
      res.end(Buffer.from(body));
    } catch (e) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
  };
}

const explorerProxyPlugin = {
  name: "explorer-api-proxy",
  configureServer(server) {
    server.middlewares.use(explorerMiddleware());
  },
  configurePreviewServer(server) {
    server.middlewares.use(explorerMiddleware());
  },
};

export default defineConfig({
  plugins: [react(), explorerProxyPlugin],
});
