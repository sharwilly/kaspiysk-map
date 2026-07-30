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