const pool = require("./db");

async function closeOutage(feeder) {

    try {

        const result = await pool.query(
            `
            WITH target AS (

                SELECT id
                FROM power_outages
                WHERE feeder = $1
                  AND status = 'active'
                ORDER BY created_at DESC
                LIMIT 1

            )

            UPDATE power_outages
            SET
                status = 'done'

            WHERE id IN (
                SELECT id
                FROM target
            )

            RETURNING
                id,
                feeder,
                created_at,
                restore_time
            `,
            [feeder]
        );


        if (result.rows.length === 0) {

            console.log(
                `ℹ️ Активное отключение по фидеру ${feeder} не найдено`
            );

            return;

        }


        console.log(
            `✅ Отключение по фидеру ${feeder} закрыто:`,
            result.rows[0]
        );


    } catch (error) {

        console.error(
            `Ошибка закрытия отключения по фидеру ${feeder}:`,
            error.message
        );

    }
}


module.exports = closeOutage;