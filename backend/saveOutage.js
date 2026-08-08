const pool = require("./db");

async function saveOutage(outage) {

    try {

        // =========================================================
        // 1. ПОЛУЧАЕМ ФИДЕРЫ И ТП
        // =========================================================

        const feeders = Array.isArray(outage.feeders)
            ? outage.feeders.filter(Boolean)
            : outage.feeder
                ? [outage.feeder]
                : [];


        const transformerPoints =
            Array.isArray(outage.transformer_points)
                ? outage.transformer_points.filter(Boolean)
                : outage.transformer_point
                    ? [outage.transformer_point]
                    : [];


        // =========================================================
        // 2. ВСЕ ФИДЕРЫ В РАБОТЕ
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
        // 3. СООБЩЕНИЕ О ЗАВЕРШЕНИИ
        // =========================================================

        if (outage.status === "completed") {

            // -----------------------------------------------------
            // 3.1. Если нет ни фидеров, ни ТП
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
            // 3.2. Закрываем фидеры
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
            // 3.3. Закрываем ТП
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


            return;
        }


        // =========================================================
        // 4. ЗАЩИТА ОТ ПУСТОГО ОТКЛЮЧЕНИЯ
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
        // 5. ПОДГОТОВКА АДРЕСОВ
        // =========================================================

        const addresses =
            Array.isArray(outage.addresses)
                ? outage.addresses.filter(Boolean)
                : [];


        const restoreTime =
            outage.restore_time || null;


        const description =
            outage.description ||
            "Отключение электроэнергии";


        const outageType =
            outage.type ||
            "электричество";


        // =========================================================
        // 6. СОХРАНЕНИЕ ФИДЕРОВ
        // =========================================================
        //
        // Обычно parser уже разделяет несколько фидеров
        // и передаёт telegram_id вида:
        //
        // go_i_chs/16965_ЗТМ-3
        //
        // Поэтому здесь сохраняем один объект.
        //
        // =========================================================

        if (feeders.length > 0) {

            const feeder =
                outage.feeder ||
                feeders[0];


            const telegramId =
                outage.telegram_id || null;


            // -----------------------------------------------------
            // Проверяем существующую запись
            // -----------------------------------------------------

            if (telegramId) {

                const exists = await pool.query(
                    `
                    SELECT
                        id,
                        addresses,
                        status,
                        restore_time
                    FROM power_outages
                    WHERE telegram_id = $1
                    LIMIT 1
                    `,
                    [telegramId]
                );


                // -------------------------------------------------
                // ЗАПИСЬ УЖЕ СУЩЕСТВУЕТ
                // -------------------------------------------------

                if (exists.rows.length > 0) {

                    const existing =
                        exists.rows[0];


                    const oldAddresses =
                        Array.isArray(existing.addresses)
                            ? existing.addresses
                            : [];


                    const shouldUpdateAddresses =
                        addresses.length > 0 &&
                        (
                            oldAddresses.length === 0 ||
                            JSON.stringify(oldAddresses) !==
                            JSON.stringify(addresses)
                        );


                    if (shouldUpdateAddresses) {

                        await pool.query(
                            `
                            UPDATE power_outages
                            SET
                                addresses = $1,
                                restore_time = COALESCE(
                                    $2,
                                    restore_time
                                ),
                                status = $3
                            WHERE telegram_id = $4
                            `,
                            [
                                addresses,

                                restoreTime,

                                "active",

                                telegramId
                            ]
                        );


                        console.log(
                            "🔄 Обновлена существующая запись фидера:",
                            telegramId
                        );

                    } else {

                        console.log(
                            "⏭ Сообщение уже обработано:",
                            telegramId
                        );

                    }


                    return;
                }
            }


            // -----------------------------------------------------
            // НОВАЯ ЗАПИСЬ
            // -----------------------------------------------------

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
                    outageType,

                    feeder,

                    outage.substation || "",

                    [],

                    description,

                    addresses,

                    restoreTime,

                    "active",

                    telegramId,

                    "telegram"
                ]
            );


            console.log(
                "✅ Новое отключение сохранено:",
                `фидер: ${feeder}`
            );


            return;
        }


        // =========================================================
        // 7. СОХРАНЕНИЕ ТП
        // =========================================================
        //
        // КРИТИЧЕСКИ ВАЖНО:
        //
        // Если сообщение:
        //
        // ТП-43 и ТП-Каспийская гавань
        //
        // создаём ДВЕ записи:
        //
        // ТП-43
        // ТП-Каспийская гавань
        //
        // И каждая запись содержит только СВОЮ ТП.
        //
        // Адреса при этом относятся к сообщению целиком,
        // поэтому передаются обеим ТП.
        //
        // =========================================================

        for (const transformerPoint of transformerPoints) {

            const telegramId =
                `${outage.telegram_id}_${transformerPoint}`;


            console.log(
                "Обрабатываем ТП:",
                transformerPoint
            );


            // -----------------------------------------------------
            // Проверяем существующую запись
            // -----------------------------------------------------

            const exists = await pool.query(
                `
                SELECT
                    id,
                    addresses,
                    status,
                    restore_time,
                    transformer_points
                FROM power_outages
                WHERE telegram_id = $1
                LIMIT 1
                `,
                [telegramId]
            );


            // -----------------------------------------------------
            // ЗАПИСЬ УЖЕ СУЩЕСТВУЕТ
            // -----------------------------------------------------

            if (exists.rows.length > 0) {

                const existing =
                    exists.rows[0];


                const oldAddresses =
                    Array.isArray(existing.addresses)
                        ? existing.addresses
                        : [];


                const oldTransformerPoints =
                    Array.isArray(existing.transformer_points)
                        ? existing.transformer_points
                        : [];


                const shouldUpdateAddresses =
                    addresses.length > 0 &&
                    (
                        oldAddresses.length === 0 ||
                        JSON.stringify(oldAddresses) !==
                        JSON.stringify(addresses)
                    );


                const shouldFixTransformerPoint =
                    (
                        oldTransformerPoints.length !== 1 ||
                        oldTransformerPoints[0] !== transformerPoint
                    );


                if (
                    shouldUpdateAddresses ||
                    shouldFixTransformerPoint ||
                    (
                        restoreTime &&
                        existing.restore_time !== restoreTime
                    )
                ) {

                    await pool.query(
                        `
                        UPDATE power_outages
                        SET
                            transformer_points = $1,
                            addresses = CASE
                                WHEN $2::text[] IS NOT NULL
                                    AND cardinality($2::text[]) > 0
                                THEN $2
                                ELSE addresses
                            END,
                            restore_time = COALESCE(
                                $3,
                                restore_time
                            ),
                            status = 'active'
                        WHERE telegram_id = $4
                        `,
                        [
                            [transformerPoint],

                            addresses.length > 0
                                ? addresses
                                : null,

                            restoreTime,

                            telegramId
                        ]
                    );


                    console.log(
                        "🔄 Обновлена существующая запись ТП:",
                        transformerPoint
                    );

                } else {

                    console.log(
                        "⏭ Сообщение уже обработано:",
                        telegramId
                    );

                }


                continue;
            }


            // -----------------------------------------------------
            // НОВАЯ ЗАПИСЬ ТП
            // -----------------------------------------------------

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
                    outageType,

                    null,

                    outage.substation || "",

                    [transformerPoint],

                    description,

                    addresses,

                    restoreTime,

                    "active",

                    telegramId,

                    "telegram"
                ]
            );


            console.log(
                "✅ Новое отключение сохранено:",
                `ТП: ${transformerPoint}`
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