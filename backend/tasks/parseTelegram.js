const axios = require("axios");

async function parseTelegram() {

    try {

        console.log("Проверка Telegram...");

        const response = await axios.get(
            "https://t.me/s/go_i_chs",
            {
                timeout: 10000
            }
        );

        console.log(
            "Telegram доступен:",
            response.status
        );

    } catch (error) {

        console.error(
            "Ошибка Telegram:",
            error.message
        );

    }

}


module.exports = parseTelegram;