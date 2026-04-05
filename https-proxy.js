/**
 * HTTPS reverse proxy: 443 → localhost:3000
 * Использует существующий сертификат eterapy.com
 * Запуск: sudo node https-proxy.js
 */
const https = require("https");
const http  = require("http");
const fs    = require("fs");
const path  = require("path");
const net   = require("net");

const CERT_DIR = path.join(__dirname, "certs");
const options = {
  key:  fs.readFileSync(path.join(CERT_DIR, "key.pem")),
  cert: fs.readFileSync(path.join(CERT_DIR, "cert.pem")),
};

const TARGET_HOST = "127.0.0.1";
const TARGET_PORT = 3000;
const HTTPS_PORT  = 443;
const HTTP_PORT   = 80; // редирект HTTP → HTTPS

function proxy(req, res) {
  const options = {
    hostname: TARGET_HOST,
    port:     TARGET_PORT,
    path:     req.url,
    method:   req.method,
    headers:  {
      ...req.headers,
      host: "eterapy.com",
      "x-forwarded-proto": "https",
      "x-forwarded-for":   req.socket.remoteAddress,
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error("[proxy error]", err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end("Bad Gateway");
    }
  });

  req.pipe(proxyReq, { end: true });
}

// HTTPS сервер
https.createServer(options, proxy).listen(HTTPS_PORT, () => {
  console.log(`✅ HTTPS proxy :${HTTPS_PORT} → localhost:${TARGET_PORT}`);
});

// HTTP → HTTPS редирект
http.createServer((req, res) => {
  res.writeHead(301, { Location: `https://eterapy.com${req.url}` });
  res.end();
}).listen(HTTP_PORT, () => {
  console.log(`✅ HTTP  :${HTTP_PORT} → redirect HTTPS`);
});

console.log("Certificates loaded from:", CERT_DIR);
