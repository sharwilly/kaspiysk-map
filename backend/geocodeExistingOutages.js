const pool = require("./db");
const geocodeAddress = require("./utils/geocodeAddress");

// =========================================================
// НАСТРОЙКИ
// =========================================================

const RETRIES = 3;
const RETRY_DELAY = 3000;


// =========================================================
// ЗАДЕРЖКА
// =========================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// =========================================================
// ЗАПРОС К БД С ПОВТОРОМ
// =========================================================

async function queryWithRetry(text, params = []) {

    let lastError = null;

    for (let attempt = 1; attempt <= RETRIES; attempt++) {

        try {

            return await pool.query(
                text,
                params
            );

        } catch (error) {

            lastError = error;

            console.error(
                `❌ Ошибка PostgreSQL. Попытка ${attempt}/${RETRIES}:`,
                error.message
            );

            if (attempt < RETRIES) {

                console.log(
                    `⏳ Ждём ${RETRY_DELAY / 1000} сек...`
                );

                await sleep(RETRY_DELAY);

            }

        }

    }

    throw lastError;
}


// =========================================================
// ГЕОКОДИРОВАНИЕ
// =========================================================

async function main() {

    console.log("");
    console.log("======================================");
    console.log("ГЕОКОДИРОВАНИЕ СУЩЕСТВУЮЩИХ ОТКЛЮЧЕНИЙ");
    console.log("======================================");
    console.log("");


    try {

        // =====================================================
        // ПОЛУЧАЕМ ЗАПИСИ БЕЗ КООРДИНАТ
        // =====================================================

        const result = await queryWithRetry(`
            SELECT
                id,
                addresses,
                address_points
            FROM power_outages
            WHERE
                addresses IS NOT NULL
                AND cardinality(addresses) > 0
                AND (
                    address_points IS NULL
                    OR jsonb_array_length(address_points) = 0
                )
            ORDER BY id
        `);


        console.log(
            `Найдено записей для геокодирования: ${result.rows.length}`
        );


        if (result.rows.length === 0) {

            console.log("");
            console.log(
                "✅ Все записи уже имеют координаты."
            );

            return;
        }


        // =====================================================
        // ОБРАБАТЫВАЕМ КАЖДОЕ ОТКЛЮЧЕНИЕ
        // =====================================================

        for (const outage of result.rows) {

            console.log("");
            console.log("--------------------------------------");
            console.log(
                `Отключение ID: ${outage.id}`
            );
            console.log("--------------------------------------");


            const addresses =
                Array.isArray(outage.addresses)
                    ? outage.addresses.filter(Boolean)
                    : [];


            if (addresses.length === 0) {

                console.log(
                    "⚠️ Адресов нет — пропускаем"
                );

                continue;
            }


            const points = [];


            // =================================================
            // ГЕОКОДИРУЕМ АДРЕСА
            // =================================================

            for (const address of addresses) {

                console.log(
                    `🌍 Геокодируем: ${address}`
                );


                try {

                    const coordinates =
                        await geocodeAddress(address);


                    if (!coordinates) {

                        console.log(
                            `⚠️ Не найдено: ${address}`
                        );

                        continue;
                    }


                    const latitude =
                        Number(
                            coordinates.latitude
                        );


                    const longitude =
                        Number(
                            coordinates.longitude
                        );


                    if (
                        !Number.isFinite(latitude) ||
                        !Number.isFinite(longitude)
                    ) {

                        console.log(
                            `⚠️ Некорректные координаты: ${address}`
                        );

                        continue;
                    }


                    points.push({

                        address,

                        latitude,

                        longitude

                    });


                    console.log(
                        `✅ ${address} →`,
                        latitude,
                        longitude
                    );


                } catch (error) {

                    console.error(
                        `❌ Ошибка геокодирования ${address}:`,
                        error.message
                    );

                }

            }


            // =================================================
            // СОХРАНЯЕМ РЕЗУЛЬТАТ
            // =================================================

            if (points.length === 0) {

                console.log(
                    "⚠️ Ни одного адреса не удалось геокодировать"
                );

                continue;
            }


            console.log(
                `💾 Сохраняем ${points.length} координат для ID ${outage.id}`
            );


            try {

                await queryWithRetry(
                    `
                    UPDATE power_outages
                    SET
                        address_points = $1::jsonb
                    WHERE id = $2
                    `,
                    [
                        JSON.stringify(points),
                        outage.id
                    ]
                );


                console.log(
                    `✅ ID ${outage.id} успешно сохранён`
                );


            } catch (error) {

                console.error(
                    `❌ Не удалось сохранить ID ${outage.id}:`,
                    error.message
                );

                // Не останавливаем весь процесс
                continue;
            }

        }


        // =====================================================
        // ПРОВЕРКА
        // =====================================================

        console.log("");
        console.log("--------------------------------------");
        console.log("ПРОВЕРКА РЕЗУЛЬТАТА");
        console.log("--------------------------------------");


        const check =
            await queryWithRetry(`
                SELECT
                    COUNT(*) AS count
                FROM power_outages
                WHERE
                    address_points IS NOT NULL
                    AND jsonb_array_length(address_points) > 0
            `);


        console.log(
            `Записей с координатами: ${check.rows[0].count}`
        );


        console.log("");
        console.log("======================================");
        console.log("✅ ГЕОКОДИРОВАНИЕ ЗАВЕРШЕНО");
        console.log("======================================");


    } catch (error) {

        console.error("");
        console.error(
            "❌ КРИТИЧЕСКАЯ ОШИБКА:"
        );

        console.error(
            error.message
        );

        console.error(
            error.stack
        );

    }

    // ВАЖНО:
    // Здесь НЕ вызываем pool.end().
    //
    // Иначе если этот файл запускается рядом
    // с другими процессами, соединение будет закрыто.


}


main();