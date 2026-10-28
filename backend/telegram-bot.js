module.exports = function installTelegramBot(app) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
    const api = token ? `https://api.telegram.org/bot${token}` : null;

    if (!token || !secret || !webhookUrl) {
        console.warn('[telegram-bot] Missing TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET or TELEGRAM_WEBHOOK_URL; bot commands are disabled.');
        return;
    }

    app.post('/telegram/webhook', (req, res) => {
        if (req.get('x-telegram-bot-api-secret-token') !== secret) {
            return res.sendStatus(403);
        }

        res.sendStatus(200);
        const update = req.body || {};
        const message = update.message || update.edited_message;
        const text = message && typeof message.text === 'string' ? message.text.trim() : '';
        const chatId = message && message.chat && message.chat.id;
        if (!chatId || !text) return;

        const command = text.split(/\\s+/)[0].split('@')[0].toLowerCase();
        const pages = {
            '/problem': { title: '🗺 Карта проблем города', url: 'https://kaspiysk-map.vercel.app/problems.html', description: 'Посмотрите обращения жителей и сообщите о проблеме в Каспийске.' },
            '/outages': { title: '⚡ Отключения света', url: 'https://kaspiysk-map.vercel.app/outages.html', description: 'Информация об отключениях электроэнергии и карта отключений.' },
            '/trucks': { title: '🚛 Карта коммунальной техники', url: 'https://kaspiysk-map.vercel.app/trucks.html', description: 'Карта коммунальной техники и мусоровозов.' },
            '/procurements': { title: '📍 Карта госзакупок', url: 'https://kaspiysk-map.vercel.app/procurements.html', description: 'Посмотрите объекты и сведения о государственных закупках на карте.' },
            '/weather': { title: '🌦 Погода', url: 'https://kaspiysk-map.vercel.app/weather.html', description: 'Погодная информация для Каспийска.' },
            '/geography': { title: '🌍 География Дагестана', url: 'https://kaspiysk-map.vercel.app/geography.html', description: 'Интерактивная карта административных районов Дагестана и географическая викторина.' },
            '/about': { title: 'ℹ️ О проекте', url: 'https://kaspiysk-map.vercel.app/about.html', description: 'Узнайте о проекте «Открытый Каспийск».' }
        };
        const menuCommands = ['/problem', '/outages', '/trucks', '/procurements', '/weather', '/geography', '/about'];
        const showMenu = command === '/start' || command === '/help';
        if (!pages[command] && !showMenu) return;

        const selectedPages = showMenu ? menuCommands.map(key => pages[key]) : [pages[command]];
        const keyboard = selectedPages.map(page => [{ text: page.title, web_app: { url: page.url } }]);
        const messageText = showMenu
            ? 'Добро пожаловать в «Открытый Каспийск»! Выберите нужный раздел:'
            : pages[command].description;

        fetch(`${api}/sendMessage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: messageText, reply_markup: { inline_keyboard: keyboard } })
        }).then(async response => {
            if (!response.ok) console.error('[telegram-bot] sendMessage failed:', response.status, await response.text());
            else {
                const result = await response.json().catch(() => ({}));
                if (!result.ok) console.error('[telegram-bot] sendMessage rejected:', result.description);
            }
        }).catch(error => console.error('[telegram-bot] sendMessage error:', error.message));
    });

    fetch(`${api}/setWebhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl, secret_token: secret, allowed_updates: ['message'] })
    }).then(async response => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
            console.error('[telegram-bot] setWebhook failed:', result.description || response.status);
            return;
        }
        console.log('[telegram-bot] Webhook registered');
        const commands = [
            { command: 'start', description: 'Открыть меню разделов' },
            { command: 'problem', description: 'Карта проблем города' },
            { command: 'outages', description: 'Отключения электроэнергии' },
            { command: 'trucks', description: 'Карта коммунальной техники' },
            { command: 'procurements', description: 'Карта госзакупок' },
            { command: 'weather', description: 'Погода в Каспийске' },
            { command: 'geography', description: 'География Дагестана' },
            { command: 'about', description: 'О проекте' },
            { command: 'help', description: 'Список разделов' }
        ];
        const commandResponse = await fetch(`${api}/setMyCommands`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ commands })
        });
        const commandResult = await commandResponse.json().catch(() => ({}));
        if (!commandResponse.ok || !commandResult.ok) {
            console.error('[telegram-bot] setMyCommands failed:', commandResult.description || commandResponse.status);
        } else {
            console.log('[telegram-bot] Bot commands registered');
        }
    }).catch(error => console.error('[telegram-bot] setWebhook error:', error.message));
};
