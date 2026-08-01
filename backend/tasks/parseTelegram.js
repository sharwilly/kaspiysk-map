const cheerio = require("cheerio");

const axios = require("axios");

const parseOutage = require("../utils/parseOutage");
const saveOutage = require("../saveOutage");


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

        console.log("Есть сообщения:",
            response.data.includes("tgme_widget_message")
        );

        const $ = cheerio.load(response.data);

        console.log("Количество .tgme_widget_message:",
            $(".tgme_widget_message").length
        );

        console.log("Количество .tgme_widget_message_text:",
            $(".tgme_widget_message_text").length
        );

        const messages = [];

        $(".tgme_widget_message").each((i, el)=>{

            const text = $(el)
                .find(".tgme_widget_message_text")
                .text()
                .trim();

            console.log("Сообщение", i, ":", text.substring(0,100));


            if(!text) return;


            const lower = text.toLowerCase();

            if (
                lower.includes("завершены") ||
                lower.includes("восстановлено") ||
                lower.includes("аварийно-восстановительные")
            ) {

                const message = $(el);

                console.log("========== ЗАВЕРШЕНИЕ ==========");
                console.log("POST:", message.attr("data-post"));

                console.log("REPLY HTML:");
                console.log(message.find(".tgme_widget_message_reply").html());

                console.log("REPLY TEXT:");
                console.log(message.find(".tgme_widget_message_reply").text());

                console.log("================================");
            }

            if(
                lower.includes("фидер") ||
                lower.includes("отключение электроснабжения") ||
                lower.includes("ограничение электроснабжения") ||
                lower.includes("горэлектросет")
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

            outage.telegram_id = msg.telegram_id;

            console.log("----------------");
            console.log(outage);

            await saveOutage(outage);

        }


    } catch(error){

        console.error(
            "Ошибка Telegram:",
            error.message
        );

    }

}

module.exports = parseTelegram;