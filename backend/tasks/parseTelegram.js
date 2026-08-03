const cheerio = require("cheerio");

const axios = require("axios");

const parseOutage = require("../utils/parseOutage");
const saveOutage = require("../saveOutage");
const closeOutage = require("../closeOutage");

const feederMap = require("../utils/feederMap");


async function parseTelegram() {

    console.log("НОВАЯ ВЕРСИЯ ПАРСЕРА ЗАПУЩЕНА");

    try {

        console.log("Проверка Telegram...");


        const response = await axios.get(
            "https://t.me/s/go_i_chs",
            {
                timeout:10000
            }
        );

        console.log(response.data.length);

        console.log("Есть сообщения:",
            response.data.includes("tgme_widget_message")
        );
        

        const posts = response.data.match(/data-post="/g);

        console.log("Всего data-post:", posts ? posts.length : 0);

        const $ = cheerio.load(response.data);

        console.log("Количество .tgme_widget_message:",
            $(".tgme_widget_message").length
        );

        console.log("Количество .tgme_widget_message_text:",
            $(".tgme_widget_message_text").length
        );

        const messages = [];
        const completed = [];

        $(".tgme_widget_message").each((i, el)=>{

            const text = $(el)
                .find(".tgme_widget_message_text")
                .text()
                .trim();

            console.log("Сообщение", i, ":", text.substring(0,100));


            if(!text) return;


            const lower = text.toLowerCase();

            const replyLink = $(el)
                .find(".tgme_widget_message_reply a")
                .attr("href");

            console.log("REPLY LINK:", replyLink);

            if (
                lower.includes("завершены") ||
                lower.includes("восстановлено") ||
                lower.includes("аварийно-восстановительные")
            ) {

                const message = $(el);

                const replyText = message
                    .find(".tgme_widget_message_reply")
                    .text()
                    .trim();


                if (replyText) {

                    const oldOutage = parseOutage(replyText);

                    console.log(
                        "НАЙДЕНО ЗАВЕРШЕНИЕ ФИДЕРА:",
                        oldOutage.feeder
                    );

                    if (oldOutage.feeder) {

                        completed.push({
                            feeder: oldOutage.feeder
                        });

                    }

                }

            }

            if(
                !lower.includes("восстановлено") &&
                !lower.includes("работы завершены") &&
                !lower.includes("завершены") &&
                (
                    lower.includes("фидер") ||
                    lower.includes("отключение электроснабжения") ||
                    lower.includes("ограничение электроснабжения") ||
                    lower.includes("горэлектросет")
                )
            ){

                const postId = $(el).attr("data-post");


                messages.push({
                    text,
                    telegram_id: postId
                });

            }

        });
        


        console.log(
            "Найдено сообщений:",
            messages.length
        );
        
        for (const msg of messages) {

            const outage = parseOutage(msg.text);

            if (outage.feeders.length > 1) {

                for (const feeder of outage.feeders) {

                    const item = {
                        ...outage,
                        feeder,
                        addresses: feederMap[feeder] || outage.addresses,
                        telegram_id: `${msg.telegram_id}_${feeder}`
                    };

                    await saveOutage(item);

                }

            } else {

                outage.telegram_id = msg.telegram_id;

                await saveOutage(outage);

            }

        }

        for (const item of completed) {

            console.log(
                "Закрываем фидер:",
                item.feeder
            );

            await closeOutage(item.feeder);

        }


    } catch(error){

        console.error(
            "Ошибка Telegram:",
            error.message
        );

    }

}

module.exports = parseTelegram;