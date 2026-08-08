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
    // 2. ПОЛУЧАЕМ ФИДЕРЫ И ТП
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
            RETURNING id, feeder, transformer_points
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
    // 4. СООБЩЕНИЕ О ЗАВЕРШЕНИИ РАБОТ
    // =========================================================

    if (outage.status === "completed") {

        // -----------------------------------------------------
        // Если нет ни фидеров, ни ТП
        // -----------------------------------------------------

        if (
            feeders.length === 0 &&
            transformerPoints.length === 0
        ) {

            console.log(
                "⚠️ Сообщение о восстановлении без фидера и ТП. Новая запись не создаётся."
            );

            return;
        }


        // -----------------------------------------------------
        // 4.1. Закрываем фидеры
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
                    `ℹ️ Активного отключения по фидеру ${feeder} не найдено`
                );

            }

        }


        // -----------------------------------------------------
        // 4.2. Закрываем ТП
        // -----------------------------------------------------

        for (const transformerPoint of transformerPoints) {

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
                    $3 = ANY(transformer_points)
                    AND status = 'active'
                RETURNING id
                `,
                [
                    outage.description ||
                    "Электроснабжение восстановлено",

                    outage.restore_time || null,

                    transformerPoint
                ]
            );


            if (result.rows.length > 0) {

                console.log(
                    `✅ Отключение ${transformerPoint} закрыто:`,
                    result.rows.map(row => row.id)
                );

            } else {

                console.log(
                    `ℹ️ Активного отключения ${transformerPoint} не найдено`
                );

            }

        }


        // -----------------------------------------------------
        // Само сообщение о восстановлении не сохраняем
        // -----------------------------------------------------

        return;
    }


    // =========================================================
    // 5. ЗАЩИТА ОТ ОТКЛЮЧЕНИЯ БЕЗ ФИДЕРА И ТП
    // =========================================================

    if (
        feeders.length === 0 &&
        transformerPoints.length === 0
    ) {

        console.log(
            "⚠️ Отключение без фидера и ТП. Новая запись не создаётся."
        );

        return;
    }


    // =========================================================
    // 6. ОСНОВНОЙ ФИДЕР
    // =========================================================

    const feeder =
        outage.feeder ||
        feeders[0] ||
        null;


    // =========================================================
    // 7. СОХРАНЕНИЕ НОВОГО ОТКЛЮЧЕНИЯ
    // =========================================================

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


    // =========================================================
    // 8. ЛОГ
    // =========================================================

    if (feeders.length > 0) {

        console.log(
            "✅ Новое отключение сохранено:",
            `фидеры: ${feeders.join(", ")}`
        );

    }

    if (transformerPoints.length > 0) {

        console.log(
            "✅ Новое отключение сохранено:",
            `ТП: ${transformerPoints.join(", ")}`
        );

    }


} catch (error) {

    console.error(
        "❌ Ошибка сохранения отключения:",
        error.message
    );

}

}

module.exports = saveOutage;
