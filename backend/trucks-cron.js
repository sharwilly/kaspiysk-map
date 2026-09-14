require('dotenv').config();

const pool = require('./db');
const { pollSource } = require('./trucks-init');

async function main() {
    const startedAt = Date.now();

    try {
        const result = await pollSource({ force: true });

        console.log(JSON.stringify({
            ok: true,
            vehicles: result.count ?? 0,
            recordedAt: result.recordedAt ?? null,
            durationMs: Date.now() - startedAt
        }));
    } finally {
        await pool.end();
    }
}

main().catch(error => {
    console.error('[trucks-cron] failed:', error.message);
    process.exitCode = 1;
});
