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
app.use(express.json({ limit: '256kb' }));
installTruckRoutes(app);

// Telegram bot commands. Configure TELEGRAM_BOT_TOKEN and
// TELEGRAM_WEBHOOK_SECRET in Render; the secret is checked on every webhook call.
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const telegramApi = telegramBotToken
    ? `https://api.telegram.org/bot${telegramBotToken}`
    : null;

app.post('/telegram/webhook', async (req, res) => {
    if (!telegramBotToken || !telegramWebhookSecret) {
        return res.status(503).json({ error: 'Telegram bot is not configured' });
    }

    if (req.get('x-telegram-bot-api-secret-token') !== telegramWebhookSecret) {
        return res.sendStatus(403);
    }

    // Acknowledge Telegram quickly; process the update asynchronously.
    res.sendStatus(200);
    const message = req.body && (req.body.message || req.body.edited_message);
    const text = message && typeof message.text === 'string' ? message.text.trim() : '';
    const chatId = message && message.chat && message.chat.id;
    if (!chatId || !text) return;

    const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();
    const pages = {
        '/problem': { title: '🗺 Карта проблем города', url: 'https://kaspiysk-map.vercel.app/problems.html', description: 'Посмотрите обращения жителей и сообщите о проблеме в Каспийске.' },
        '/outages': { title: '⚡ Отключения света', url: 'https://kaspiysk-map.vercel.app/outages.html', description: 'Информация об отключениях электроэнергии и карта отключений.' },
        '/trucks': { title: '🚛 Карта коммунальной техники', url: 'https://kaspiysk-map.vercel.app/trucks.html', description: 'Карта коммунальной техники и мусоровозов.' },
        '/procurements': { title: '📍 Карта госзакупок', url: 'https://kaspiysk-map.vercel.app/procurements.html', description: 'Посмотрите объекты и сведения о государственных закупках на карте.' },
        '/weather': { title: '🌦 Погода', url: 'https://kaspiysk-map.vercel.app/weather.html', description: 'Погодная информация для Каспийска.' },
        '/geography': { title: '🌍 География города', url: 'https://kaspiysk-map.vercel.app/geography.html', description: 'Географическая информация и материалы о городе.' },
        '/about': { title: 'ℹ️ О проекте', url: 'https://kaspiysk-map.vercel.app/about.html', description: 'Узнайте о проекте «Открытый Каспийск».' }
    };
    const menuCommands = ['/problem', '/outages', '/trucks', '/procurements', '/weather', '/geography', '/about'];
    const isMenuCommand = command === '/start' || command === '/help';
    if (!pages[command] && !isMenuCommand) return;

    const selectedPages = isMenuCommand ? menuCommands.map(key => pages[key]) : [pages[command]];
    const keyboard = selectedPages.map(page => [{ text: page.title, web_app: { url: page.url } }]);
    const messageText = isMenuCommand
        ? 'Добро пожаловать в «Открытый Каспийск»! Выберите нужный раздел:'
        : pages[command].description;

    try {
        const response = await fetch(\`\${telegramApi}/sendMessage\`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: messageText, reply_markup: { inline_keyboard: keyboard } })
        });
        if (!response.ok) {
            console.error('Telegram sendMessage failed:', response.status, await response.text());
        }
    } catch (error) {
        console.error(\`Telegram \${command} command failed:\`, error.message);
    }
});

// Register the webhook automatically when both public URL and credentials are set.
if (telegramApi && telegramWebhookSecret && process.env.TELEGRAM_WEBHOOK_URL) {
    fetch(`${telegramApi}/setWebhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            url: process.env.TELEGRAM_WEBHOOK_URL,
            secret_token: telegramWebhookSecret,
            allowed_updates: ['message']
        })
    }).then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
            console.error('Telegram setWebhook failed:', result.description || response.status);
        } else {
            console.log('Telegram webhook registered');
            fetch(\`\${telegramApi}/setMyCommands\`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    commands: [
                        { command: 'start', description: 'Открыть меню разделов' },
                        { command: 'problem', description: 'Карта проблем города' },
                        { command: 'outages', description: 'Отключения электроэнергии' },
                        { command: 'trucks', description: 'Карта коммунальной техники' },
                        { command: 'procurements', description: 'Карта госзакупок' },
                        { command: 'weather', description: 'Погода в Каспийске' },
                        { command: 'geography', description: 'География города' },
                        { command: 'about', description: 'О проекте' },
                        { command: 'help', description: 'Список разделов' }
                    ]
                })
            }).then(async commandResponse => {
                const commandResult = await commandResponse.json().catch(() => ({}));
                if (!commandResponse.ok || !commandResult.ok) {
                    console.error('Telegram setMyCommands failed:', commandResult.description || commandResponse.status);
                } else {
                    console.log('Telegram bot commands registered');
                }
            }).catch(error => console.error('Telegram setMyCommands error:', error.message));
        }
    }).catch(error => console.error('Telegram setWebhook error:', error.message));
}

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
