const cheerio = require("cheerio");

const axios = require("axios");


async function parseTelegram() {

    try {

        console.log("Проверка Telegram...");


        const response = await axios.get(
            "https://t.me/s/go_i_chs",
            {
                timeout:10000
            }
        );


        const $ = cheerio.load(response.data);

        const messages = [];

        $(".tgme_widget_message_text").each((i, el)=>{

            const text = $(el)
                .text()
                .trim();


            if(
                text.includes("Фидер") ||
                text.includes("фидер") ||
                text.includes("отключение электроснабжения") ||
                text.includes("ограничение электроснабжения")
            ){

                messages.push(text);

            }

        });


        console.log(
            "Найдено сообщений:",
            messages.length
        );


        messages.forEach(msg=>{

            console.log("----------------");
            console.log(msg);

        });


        $(".tgme_widget_message_text").each((i, el)=>{

            console.log("----------------");

            console.log(
                $(el).text().trim()
            );

        });


    } catch(error){

        console.error(
            "Ошибка Telegram:",
            error.message
        );

    }

}


module.exports = parseTelegram;