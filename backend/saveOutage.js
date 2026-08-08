const pool = require("./db");
const geocodeAddress = require("./utils/geocodeAddress");

// =========================================================
// ГЕОКОДИРОВАНИЕ МАССИВА АДРЕСОВ
// =========================================================

async function geocodeAddresses(addresses) {

    const points = [];

    if (!Array.isArray(addresses) || addresses.length === 0) {
        return points;
    }

    for (const address of addresses) {

        if (!address) {
            continue;
        }

        try {

            console.log(
                `🌍 Геокодируем адрес: ${address}`
            );

            const point =
                await geocodeAddress(address);

            if (
                point &&
                point.latitude != null &&
                point.longitude != null
            ) {

                points.push({
                    address: address,
                    latitude: Number(point.latitude),
                    longitude: Number(point.longitude)
                });

                console.log(
                    `✅ Координаты: ${address} →`,
                    point.latitude,
                    point.longitude
                );

            } else {

                console.log(
                    `⚠️ Координаты не найдены: ${address}`
                );

            }

        } catch (error) {

            console.error(
                `❌ Ошибка геокодирования ${address}:`,
                error.message
            );

        }
    }

    return points;
}


// =========================================================
// СОХРАНЕНИЕ ОТКЛЮЧЕНИЯ
// =========================================================

async function saveOutage(outage) {

    try {

        // =====================================================
        // 1. ПОЛУЧАЕМ ФИДЕРЫ
        // =====================================================

        const feeders =
            Array.isArray(outage.feeders)
                ? outage.feeders.filter(Boolean)
                : outage.feeder
                    ? [outage.feeder]
                    : [];


        // =====================================================
        // 2. ПОЛУЧАЕМ ТП
        // =====================================================

        const transformerPoints =
            Array.isArray(outage.transformer_points)
                ? outage.transformer_points.filter(Boolean)
                : outage.transformer_point
                    ? [outage.transformer_point]
                    : [];


        // =====================================================
        // 3. ВСЕ ФИДЕРЫ РАБОТАЮТ
        // =====================================================

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


        // =====================================================
        // 4. СООБЩЕНИЕ О ЗАВЕРШЕНИИ
        // =====================================================

        if (outage.status === "completed") {

            // -------------------------------------------------
            // Нет ни фидера, ни ТП
            // -------------------------------------------------

            if (
                feeders.length === 0 &&
                transformerPoints.length === 0
            ) {

                console.log(
                    "⚠️ Сообщение о восстановлении без фидера и ТП."
                );

                return;
            }


            // -------------------------------------------------
            // Закрываем фидеры
            // -------------------------------------------------

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


            // -------------------------------------------------
            // Закрываем ТП
            // -------------------------------------------------

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


        // =====================================================
        // 5. ЗАЩИТА ОТ ПУСТОГО ОТКЛЮЧЕНИЯ
        // =====================================================

        if (
            feeders.length === 0 &&
            transformerPoints.length === 0
        ) {

            console.log(
                "⚠️ Отключение без фидера и ТП. Новая запись не создаётся."
            );

            return;
        }


        // =====================================================
        // 6. ПОДГОТОВКА ДАННЫХ
        // =====================================================

        const addresses =
            Array.isArray(outage.addresses)
                ? outage.addresses
                    .filter(Boolean)
                    .map(address => String(address).trim())
                : [];


        const restoreTime =
            outage.restore_time || null;


        const description =
            outage.description ||
            "Отключение электроэнергии";


        const outageType =
            outage.type ||
            "электричество";


        // =====================================================
        // 7. СОХРАНЕНИЕ ФИДЕРА
        // =====================================================

        if (feeders.length > 0) {

            const feeder =
                outage.feeder ||
                feeders[0];


            const telegramId =
                outage.telegram_id || null;


            // =================================================
            // 7.1. ПРОВЕРЯЕМ СУЩЕСТВУЮЩУЮ ЗАПИСЬ
            // =================================================

            if (telegramId) {

                const exists = await pool.query(
                    `
                    SELECT
                        id,
                        addresses,
                        address_points,
                        status,
                        restore_time
                    FROM power_outages
                    WHERE telegram_id = $1
                    LIMIT 1
                    `,
                    [telegramId]
                );


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


                    let addressPoints = null;


                    // -----------------------------------------
                    // Адреса изменились → геокодируем заново
                    // -----------------------------------------

                    if (shouldUpdateAddresses) {

                        console.log(
                            `🌍 Адреса изменились. Геокодируем ${addresses.length} адресов`
                        );

                        addressPoints =
                            await geocodeAddresses(addresses);
                    }


                    // -----------------------------------------
                    // Обновление
                    // -----------------------------------------

                    if (
                        shouldUpdateAddresses ||
                        (
                            restoreTime &&
                            existing.restore_time !== restoreTime
                        )
                    ) {

                        await pool.query(
                            `
                            UPDATE power_outages
                            SET

                                addresses = CASE
                                    WHEN $1::text[] IS NOT NULL
                                        AND cardinality($1::text[]) > 0
                                    THEN $1
                                    ELSE addresses
                                END,

                                address_points = CASE
                                    WHEN $2::jsonb IS NOT NULL
                                    THEN $2::jsonb
                                    ELSE address_points
                                END,

                                restore_time = COALESCE(
                                    $3,
                                    restore_time
                                ),

                                status = 'active'

                            WHERE telegram_id = $4
                            `,
                            [

                                addresses.length > 0
                                    ? addresses
                                    : null,

                                addressPoints !== null
                                    ? JSON.stringify(addressPoints)
                                    : null,

                                restoreTime,

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


            // =================================================
            // 7.2. НОВАЯ ЗАПИСЬ ФИДЕРА
            // =================================================

            console.log(
                `🌍 Подготавливаем координаты для ${addresses.length} адресов`
            );


            const addressPoints =
                await geocodeAddresses(addresses);


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
                    address_points,
                    restore_time,
                    status,
                    telegram_id,
                    source
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9,
                    $10,
                    $11
                )
                `,
                [

                    outageType,

                    feeder,

                    outage.substation || "",

                    [],

                    description,

                    addresses,

                    JSON.stringify(addressPoints),

                    restoreTime,

                    "active",

                    telegramId,

                    "telegram"

                ]
            );


            console.log(
                "✅ Новое отключение сохранено:",
                `фидер: ${feeder}`,
                `адресов: ${addresses.length}`,
                `координат: ${addressPoints.length}`
            );


            return;
        }


        // =====================================================
        // 8. СОХРАНЕНИЕ ТП
        // =====================================================

        for (const transformerPoint of transformerPoints) {

            // -------------------------------------------------
            // Для каждой ТП создаём отдельный telegram_id
            // -------------------------------------------------

            const telegramId =
                `${outage.telegram_id}_${transformerPoint}`;


            console.log(
                "Обрабатываем ТП:",
                transformerPoint
            );


            // =================================================
            // 8.1. ПРОВЕРЯЕМ СУЩЕСТВУЮЩУЮ ЗАПИСЬ
            // =================================================

            const exists = await pool.query(
                `
                SELECT
                    id,
                    addresses,
                    address_points,
                    status,
                    restore_time,
                    transformer_points
                FROM power_outages
                WHERE telegram_id = $1
                LIMIT 1
                `,
                [telegramId]
            );


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


                let addressPoints = null;


                // ---------------------------------------------
                // Адреса изменились → геокодируем
                // ---------------------------------------------

                if (shouldUpdateAddresses) {

                    console.log(
                        `🌍 Адреса ТП ${transformerPoint} изменились`
                    );


                    addressPoints =
                        await geocodeAddresses(addresses);
                }


                // ---------------------------------------------
                // Обновление записи
                // ---------------------------------------------

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

                            address_points = CASE
                                WHEN $3::jsonb IS NOT NULL
                                THEN $3::jsonb
                                ELSE address_points
                            END,

                            restore_time = COALESCE(
                                $4,
                                restore_time
                            ),

                            status = 'active'

                        WHERE telegram_id = $5
                        `,
                        [

                            [transformerPoint],

                            addresses.length > 0
                                ? addresses
                                : null,

                            addressPoints !== null
                                ? JSON.stringify(addressPoints)
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


            // =================================================
            // 8.2. НОВАЯ ЗАПИСЬ ТП
            // =================================================

            console.log(
                `🌍 Подготавливаем координаты для ТП ${transformerPoint}`
            );


            const addressPoints =
                await geocodeAddresses(addresses);


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
                    address_points,
                    restore_time,
                    status,
                    telegram_id,
                    source
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9,
                    $10,
                    $11
                )
                `,
                [

                    outageType,

                    null,

                    outage.substation || "",

                    [transformerPoint],

                    description,

                    addresses,

                    JSON.stringify(addressPoints),

                    restoreTime,

                    "active",

                    telegramId,

                    "telegram"

                ]
            );


            console.log(
                "✅ Новое отключение сохранено:",
                `ТП: ${transformerPoint}`,
                `адресов: ${addresses.length}`,
                `координат: ${addressPoints.length}`
            );

        }

    } catch (error) {

        console.error(
            "❌ Ошибка сохранения отключения:",
            error.message
        );

        console.error(
            error.stack
        );
    }
}


// =========================================================
// EXPORT
// =========================================================

module.exports = saveOutage;

