import http from "node:http";
import net from "node:net";
import { isPrivateAddress, safeLookup } from "./network.js";

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);
const HOP_HEADERS = ["proxy-connection", "proxy-authorization", "connection", "keep-alive", "te", "trailer", "upgrade"];

const refusesHost = (host) => {
  const bare = host.replace(/^\[|\]$/g, "");
  return net.isIP(bare) ? isPrivateAddress(bare) : /(^|\.)(localhost|local|internal)$/i.test(bare);
};

// A forward proxy for the snapshot browser. Every connection the page makes
// (documents, scripts, fetch, WebSockets) goes through here, and DNS is resolved
// here too, so pages can't reach private or internal addresses.
export function startEgressProxy() {
  const server = http.createServer((req, res) => {
    let target;
    try {
      target = new URL(req.url);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const port = Number(target.port || 80);
    if (target.protocol !== "http:" || !ALLOWED_PORTS.has(port) || refusesHost(target.hostname)) {
      res.writeHead(403, { "X-Livefolio-Refused": "private" }).end();
      return;
    }
    const headers = { ...req.headers };
    for (const name of HOP_HEADERS) delete headers[name];
    const upstream = http.request({
      host: target.hostname.replace(/^\[|\]$/g, ""),
      port,
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers,
      lookup: safeLookup,
    }, (response) => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    upstream.setTimeout(20000, () => upstream.destroy());
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });

  server.on("connect", (req, client, head) => {
    const match = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(req.url || "");
    const host = match?.[1];
    const port = Number(match?.[2]);
    if (!host || !ALLOWED_PORTS.has(port) || refusesHost(host)) {
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = net.connect({ host: host.replace(/^\[|\]$/g, ""), port, lookup: safeLookup }, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head?.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.setTimeout(30000, () => upstream.destroy());
    upstream.on("error", () => client.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"));
    client.on("error", () => upstream.destroy());
  });

  server.on("upgrade", (req, socket) => socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"));
  server.on("clientError", (error, socket) => socket.destroy());

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}
