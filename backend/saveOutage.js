const pool = require("./db");

async function saveOutage(outage) {

    try {

        // =========================================================
        // 1. ПРОВЕРКА TELEGRAM ID
        // =========================================================

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
                    "⏭ Сообщение уже обработано:",
                    outage.telegram_id
                );

                return;
            }
        }


        // =========================================================
        // 2. ПОЛУЧАЕМ ВСЕ ФИДЕРЫ
        // =========================================================

        const feeders = Array.isArray(outage.feeders)
            ? outage.feeders.filter(Boolean)
            : outage.feeder
                ? [outage.feeder]
                : [];


        const transformerPoints =
            Array.isArray(outage.transformer_points)
                ? outage.transformer_points.filter(Boolean)
                : [];

        // =========================================================
        // 3. ВСЕ ФИДЕРЫ В РАБОТЕ
        // =========================================================

        if (outage.all_feeders_working === true) {

            const result = await pool.query(
                `
                UPDATE power_outages
                SET
                    status = 'completed',
                    description = 'Электроснабжение восстановлено'
                WHERE status = 'active'
                RETURNING id, feeder
                `
            );

            if (result.rows.length > 0) {

                console.log(
                    "✅ Все активные отключения закрыты:",
                    result.rows.map(row => row.id)
                );

            } else {

                console.log(
                    "ℹ️ Активных отключений для закрытия нет"
                );

            }

            return;
        }


        // =========================================================
        // 3. СООБЩЕНИЕ О ЗАВЕРШЕНИИ РАБОТ
        // =========================================================

        if (outage.status === "completed") {

            // -----------------------------------------------------
            // Если фидеры НЕ указаны
            //
            // Например:
            //
            // "Все фидеры в работе."
            //
            // Такое сообщение нельзя превращать в новое
            // отключение.
            // -----------------------------------------------------

            if (
                feeders.length === 0 &&
                transformerPoints.length === 0
            ) {

                console.log(
                    "⚠️ Отключение без фидера и ТП. Новая запись не создаётся."
                );

                return;
            }


            // -----------------------------------------------------
            // Закрываем активные отключения указанных фидеров
            // -----------------------------------------------------

            for (const feeder of feeders) {

                const result = await pool.query(
                    `
                    UPDATE power_outages
                    SET
                        status = 'completed',
                        description = $1,
                        restore_time = COALESCE(
                            $2,
                            restore_time
                        )
                    WHERE
                        feeder = $3
                        AND status = 'active'
                    RETURNING id
                    `,
                    [
                        outage.description ||
                        "Электроснабжение восстановлено",

                        outage.restore_time || null,

                        feeder
                    ]
                );


                if (result.rows.length > 0) {

                    console.log(
                        `✅ Отключение фидера ${feeder} закрыто:`,
                        result.rows.map(row => row.id)
                    );

                } else {

                    console.log(
                        `ℹ️ Активного отключения для фидера ${feeder} не найдено`
                    );
                }
            }


            // -----------------------------------------------------
            // ВАЖНО:
            //
            // Само сообщение "восстановлено" не сохраняем
            // как новое отключение.
            // -----------------------------------------------------

            return;
        }


        // =========================================================
        // 4. ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА
        // =========================================================

        // Если сообщение каким-то образом определилось как
        // отключение, но в нём вообще нет фидера,
        // не создаём сомнительную запись.

        if (feeders.length === 0) {

            console.log(
                "⚠️ Отключение без фидера. Новая запись не создаётся."
            );

            return;
        }


        // =========================================================
        // 5. СОХРАНЕНИЕ НОВОГО ОТКЛЮЧЕНИЯ
        // =========================================================

        // Основной feeder оставляем для совместимости
        // со старой структурой базы.

        const feeder =
            outage.feeder ||
            feeders[0];


        await pool.query(
            `
            INSERT INTO power_outages
            (
                type,
                feeder,
                substation,
                transformer_points,
                description,
                addresses,
                restore_time,
                status,
                telegram_id,
                source
            )
            VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            `,
            [
                outage.type || "электричество",

                feeder,

                outage.substation || "",

                transformerPoints,

                outage.description ||
                "Отключение электроэнергии",

                Array.isArray(outage.addresses)
                    ? outage.addresses
                    : [],

                outage.restore_time || null,

                "active",

                outage.telegram_id || null,

                "telegram"
            ]
        );


        console.log(
            "✅ Новое отключение сохранено:",
            feeders.join(", ")
        );


    } catch (error) {

        console.error(
            "❌ Ошибка сохранения отключения:",
            error.message
        );

    }
}


module.exports = saveOutage;