const axios = require("axios");

async function parseTelegram() {

    const response = await axios.get(
        "https://t.me/s/go_i_chs",
        {
            timeout: 10000
        }
    );

    console.log(
        response.status
    );

}

parseTelegram();