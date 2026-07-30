const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

const input = require("input");


const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;


const client = new TelegramClient(
    new StringSession(""),
    apiId,
    apiHash,
    {
        connectionRetries: 5
    }
);


async function main(){

    await client.start({

        phoneNumber: async () =>
            await input.text("Телефон: "),


        password: async () =>
            await input.text("Пароль 2FA: "),


        phoneCode: async () =>
            await input.text("Код из Telegram: "),


        onError: (err) =>
            console.log(err)

    });


    console.log("Telegram подключен");


    const messages =
        await client.getMessages(
            "go_i_chs",
            {
                limit: 5
            }
        );


    messages.forEach(message=>{

        console.log(
            "\n---\n",
            message.message
        );

    });


}


main();