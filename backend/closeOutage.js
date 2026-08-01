const pool = require("./db");

async function closeOutage(feeder) {

    try {

        const result = await pool.query(
            `
            UPDATE power_outages
            SET status = 'done'
            WHERE feeder = $1
              AND status = 'active'
            `,
            [feeder]
        );

        console.log(
            `✅ Закрыто аварий по фидеру ${feeder}:`,
            result.rowCount
        );

    } catch (error) {

        console.error(
            "Ошибка закрытия аварии:",
            error.message
        );

    }

}

module.exports = closeOutage;