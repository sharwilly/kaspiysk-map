const pool = require("./db");


async function saveOutage(outage) {

    try {

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
                status
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7)
            `,
            [
                outage.type,
                outage.feeder,
                outage.substation,
                outage.description,
                outage.addresses,
                outage.restore_time,
                outage.status
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