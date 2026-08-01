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

        $(".tgme_widget_message_text").each((i, el)=>{

            const text = $(el)
                .text()
                .trim();

            if (text.includes("завершены")) {

                const message = $(el).closest(".tgme_widget_message");

                console.log("POST:", message.attr("data-post"));

                console.log("ATTRS:", message.attr());

                console.log("REPLY:");
                console.log(message.find(".tgme_widget_message_reply").html());

            }


            if(
                text.includes("Фидер") ||
                text.includes("фидер") ||
                text.includes("отключение электроснабжения") ||
                text.includes("ограничение электроснабжения") ||
                text.includes("горэлектросетей")
            ){

                const postId = $(el)
                    .closest(".tgme_widget_message")
                    .attr("data-post");


                if(postId){

                    messages.push({
                        text: text,
                        telegram_id: postId
                    });

                }

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