const pool = require("./db");


async function saveOutage(outage) {

    try {


        // Проверяем, было ли это сообщение уже сохранено
        if (outage.telegram_id) {

            const exists = await pool.query(
                `
                SELECT id 
                FROM power_outages
                WHERE telegram_id = $1
                `,
                [
                    outage.telegram_id
                ]
            );


            if (exists.rows.length > 0) {

                console.log(
                    "⏭ Сообщение уже есть, пропускаем:",
                    outage.telegram_id
                );

                return;

            }

        }


        await pool.query(
            `
            INSERT INTO power_outages
            (
                type,
                feeder,
                substation,
                description,
                addresses,
                restore_time,
                status,
                telegram_id
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8)
            `,
            [
                outage.type,
                outage.feeder,
                outage.substation,
                outage.description,
                outage.addresses,
                outage.restore_time,
                outage.status,
                outage.telegram_id
            ]
        );


        console.log("✅ Отключение сохранено в Neon");


    } catch(error) {

        console.error(
            "Ошибка сохранения отключения:",
            error.message
        );

    }

}


module.exports = saveOutage;