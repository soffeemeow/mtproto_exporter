import type { Registry } from "prom-client";
import http from "node:http";

export default class MetricsServer {
    private _registry: Registry;
    private _httpServer?: http.Server;

    public constructor(registry: Registry) {
        this._registry = registry;
    }

    public get registry() {
        return this._registry;
    }

    public listen(address: string, port: number) {
        if (this._httpServer) {
            throw new Error("This server is already listening");
        }
        this._httpServer = http.createServer(this._requestHandler.bind(this));
        this._httpServer.listen(port, address);
        console.log(`HTTP Metrics Server is listening on ${address}:${port}`);
    }

    private async _requestHandler(req: http.IncomingMessage, res: http.ServerResponse) {
        const url = new URL(`http://${req.headers.host ?? "localhost"}${req.url}`);
        console.log(`[HTTP] ${req.method} - ${req.socket.localAddress}:${req.socket.localPort} (${url.href}) from ${req.socket.remoteAddress}:${req.socket.remotePort}`);

        if (req.method === "GET" && url.pathname === "/metrics") {
            try {
                const metrics = await this._registry.metrics();
                res.statusCode = 200;
                res.setHeader("Content-Type", this._registry.contentType);
                res.write(metrics);
            } catch (e) {
                console.error("Metrics collection failed:", e);
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json; charset=utf-8;");
                res.write("{ \"error\":{\"message\":\"failed to collect metrics.\"}}");
            }
            return res.end();
        }

        if (!res.writableEnded) {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json; charset=utf-8;");
            res.write("{\"error\":{\"message\":\"not found.\"}}");
            return res.end();
        }
    }
}
