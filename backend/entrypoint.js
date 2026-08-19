const http = require('http');
const { spawn } = require('child_process');
const express = require('express');
const { installTruckRoutes } = require('./trucks-init');

const publicPort = Number(process.env.PORT || 3000);
const internalPort = publicPort + 1;

const childEnv = {
    ...process.env,
    PORT: String(internalPort)
};

const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: childEnv,
    stdio: 'inherit'
});

child.on('exit', (code, signal) => {
    console.error(`Backend child stopped: code=${code}, signal=${signal}`);
    process.exit(code ?? 1);
});

const app = express();
app.disable('x-powered-by');
installTruckRoutes(app);

// Proxy every existing backend endpoint to the original server.
// Truck endpoints are handled directly above so they work regardless of
// Render's start-command configuration.
app.use((req, res) => {
    const proxyReq = http.request({
        hostname: '127.0.0.1',
        port: internalPort,
        path: req.originalUrl || req.url,
        method: req.method,
        headers: {
            ...req.headers,
            host: `127.0.0.1:${internalPort}`
        }
    }, proxyRes => {
        res.statusCode = proxyRes.statusCode || 502;
        for (const [key, value] of Object.entries(proxyRes.headers)) {
            if (value !== undefined) res.setHeader(key, value);
        }
        proxyRes.pipe(res);
    });

    proxyReq.on('error', error => {
        console.error('Backend proxy error:', error.message);
        if (!res.headersSent) res.status(502).json({ error: 'Backend недоступен' });
        else res.end();
    });

    req.pipe(proxyReq);
});

app.listen(publicPort, '0.0.0.0', () => {
    console.log(`🚛 Public API gateway listening on ${publicPort}`);
});
