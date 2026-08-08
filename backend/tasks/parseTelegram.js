const cheerio = require("cheerio");
const axios = require("axios");

const parseOutage = require("../utils/parseOutage");
const saveOutage = require("../saveOutage");
const closeOutage = require("../closeOutage");

async function parseTelegram() {

    console.log("НОВАЯ ВЕРСИЯ ПАРСЕРА ЗАПУЩЕНА");

    try {

        console.log("Проверка Telegram...");

        const response = await axios.get(
            "https://t.me/s/go_i_chs",
            {
                timeout: 10000
            }
        );

        console.log("Размер страницы:", response.data.length);

        console.log(
            "Есть сообщения:",
            response.data.includes("tgme_widget_message")
        );

        const posts = response.data.match(/data-post="/g);

        console.log(
            "Всего data-post:",
            posts ? posts.length : 0
        );

        const $ = cheerio.load(response.data);

        console.log(
            "Количество .tgme_widget_message:",
            $(".tgme_widget_message").length
        );

        console.log(
            "Количество .tgme_widget_message_text:",
            $(".tgme_widget_message_text").length
        );


        // =====================================================
        // Сообщения
        // =====================================================

        const messages = [];

        const completed = [];


        // =====================================================
        // Читаем Telegram
        // =====================================================

        $(".tgme_widget_message").each((i, el) => {

            const message = $(el);

            const text = message
                .find(".tgme_widget_message_text")
                .text()
                .trim();


            if (!text) {
                return;
            }


            const lower = text.toLowerCase();


            const postId = message.attr("data-post");


            const replyText = message
                .find(".tgme_widget_message_reply")
                .text()
                .trim();


            console.log(
                "Сообщение",
                i,
                ":",
                text.substring(0, 150)
            );


            console.log(
                "Telegram ID:",
                postId
            );


            // =================================================
            // Сначала определяем сам текст через parseOutage
            // =================================================

            const parsed = parseOutage(text);


            // =================================================
            // ЗАВЕРШЕНИЕ ОТКЛЮЧЕНИЯ
            // =================================================

            if (parsed.status === "completed") {

                console.log(
                    "НАЙДЕНО СООБЩЕНИЕ О ЗАВЕРШЕНИИ:",
                    text.substring(0, 200)
                );


                /*
                    Если в самом сообщении есть фидеры,
                    закрываем их напрямую.
                */

                if (parsed.feeders.length) {

                    for (const feeder of parsed.feeders) {

                        completed.push({
                            feeder
                        });

                    }

                }


                /*
                    Если фидер не указан в самом сообщении,
                    пытаемся получить его из reply.
                */

                if (
                    parsed.feeders.length === 0 &&
                    replyText
                ) {

                    const repliedOutage =
                        parseOutage(replyText);


                    for (
                        const feeder
                        of repliedOutage.feeders
                    ) {

                        completed.push({
                            feeder
                        });

                    }

                }


                /*
                    Сообщение о завершении НЕ должно
                    попадать в messages как новое отключение.
                */

                return;
            }


            // =================================================
            // ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА
            // =================================================

            if (

                lower.includes("восстановлено") ||

                lower.includes("работы завершены") ||

                lower.includes("работы завершены") ||

                lower.includes("аварийные работы завершены")

            ) {

                console.log(
                    "Сообщение пропущено как завершение"
                );

                return;
            }


            // =================================================
            // НОВОЕ ОТКЛЮЧЕНИЕ
            // =================================================

            const isOutageMessage =

                lower.includes("фидер") ||

                lower.includes("отключение электроснабжения") ||

                lower.includes("ограничение электроснабжения") ||

                lower.includes("отключение электроэнергии") ||

                lower.includes("горэлектросет") ||

                lower.includes("дагэнерго");


            if (!isOutageMessage) {
                return;
            }


            messages.push({

                text,

                telegram_id: postId,

                reply_text: replyText

            });

        });


        // =====================================================
        // Статистика
        // =====================================================

        console.log(
            "Найдено новых сообщений:",
            messages.length
        );

        console.log(
            "Найдено завершений:",
            completed.length
        );


        // =====================================================
        // СОХРАНЕНИЕ НОВЫХ ОТКЛЮЧЕНИЙ
        // =====================================================

        for (const msg of messages) {

            const outage =
                parseOutage(msg.text);


            console.log(
                "РАСПАРСЕНО ОТКЛЮЧЕНИЕ:",
                {
                    telegram_id: msg.telegram_id,

                    feeders: outage.feeders,

                    feeder: outage.feeder,

                    outage_type: outage.outage_type,

                    status: outage.status,

                    substation: outage.substation,

                    restore_time: outage.restore_time,

                    addresses: outage.addresses
                }
            );


            // =================================================
            // Если найдено несколько фидеров
            // =================================================

            if (outage.feeders.length > 1) {

                for (const feeder of outage.feeders) {

                    /*
                        ВАЖНО:

                        Если Telegram уже дал адреса,
                        используем их.

                        feederMap используется только
                        как fallback.
                    */

                    let addresses = outage.addresses;


                    if (
                        (!addresses || addresses.length === 0)
                    ) {

                        const feederMap =
                            require("../utils/feederMap");


                        addresses =
                            feederMap[feeder] || [];
                    }


                    const item = {

                        ...outage,

                        feeder,

                        feeders: outage.feeders,

                        addresses,

                        telegram_id:
                            `${msg.telegram_id}_${feeder}`
                    };


                    console.log(
                        "Сохраняем фидер:",
                        feeder
                    );


                    await saveOutage(item);

                }

            }


            // =================================================
            // Один фидер
            // =================================================

            else {

                outage.telegram_id =
                    msg.telegram_id;


                await saveOutage(outage);

            }

        }


        // =====================================================
        // ЗАКРЫТИЕ ОТКЛЮЧЕНИЙ
        // =====================================================

        /*
            Убираем дубли фидеров.

            Например, если одно сообщение
            несколько раз определилось как завершение.
        */

        const uniqueCompleted = [
            ...new Set(
                completed.map(item => item.feeder)
            )
        ];


        for (const feeder of uniqueCompleted) {

            if (!feeder) {
                continue;
            }


            console.log(
                "Закрываем фидер:",
                feeder
            );


            try {

                await closeOutage(feeder);

                console.log(
                    "Фидер закрыт:",
                    feeder
                );

            } catch (error) {

                console.error(
                    "Ошибка закрытия фидера",
                    feeder,
                    error.message
                );

            }

        }


        console.log(
            "Парсинг Telegram завершён"
        );


    } catch (error) {

        console.error(
            "Ошибка Telegram:",
            error.message
        );

    }
}


module.exports = parseTelegram;
