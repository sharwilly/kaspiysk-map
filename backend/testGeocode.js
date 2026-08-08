const geocodeAddress =
    require("./geocodeAddress");


async function test() {

    const addresses = [

        "ул. Халилова, 32",

        "ул. Халилова, 32А",

        "ул. Халилова, 32Б",

        "ул. Халилова, 44",

        "ул. Акулиничева, 13",

        "ул. Акулиничева, 13А"

    ];


    for (const address of addresses) {

        const result =
            await geocodeAddress(address);


        console.log(
            address,
            "=>",
            result
        );

    }


    process.exit(0);

}


test();