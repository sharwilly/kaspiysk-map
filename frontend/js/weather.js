function initWeather(){

    const weatherBtn = document.getElementById("weatherBtn");
    const weatherPopover = document.getElementById("weatherPopover");


    if(!weatherBtn || !weatherPopover){

        console.log("Погода: элементы не найдены");

        return;

    }


    console.log("Погода подключена");


    // Открытие / закрытие popover

    weatherBtn.addEventListener("click", (e)=>{

        e.stopPropagation();

        weatherPopover.classList.toggle("hidden");

    });



    // Закрытие при клике вне окна

    document.addEventListener("click",(e)=>{


        if(

            !weatherPopover.contains(e.target) &&

            !weatherBtn.contains(e.target)

        ){

            weatherPopover.classList.add("hidden");

        }


    });

    loadWeather();


}

async function loadWeather(){

    const lat = 42.8913;
    const lon = 47.6397;


    const url = 
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,pressure_msl,weather_code&timezone=Europe/Moscow`;


    try{

        const response = await fetch(url);

        const data = await response.json();

        updateWeather(data);

        console.log(data);

    }
    catch(error){

        console.error(
            "Ошибка загрузки погоды:",
            error
        );

    }

}

function updateWeather(data){

    const current = data.current;


    // температура в кнопке шапки

    document.getElementById("weatherTemp").textContent =
        `${Math.round(current.temperature_2m)}°`;



    // большая температура

    document.getElementById("weatherCurrentTemp").textContent =
        `${Math.round(current.temperature_2m)}°C`;



    // ощущается

    document.getElementById("weatherFeels").textContent =
        `Ощущается: ${Math.round(current.apparent_temperature)}°C`;



    // влажность

    document.getElementById("weatherHumidity").textContent =
        `${current.relative_humidity_2m}%`;



    // ветер

    document.getElementById("weatherWind").textContent =
        `${current.wind_speed_10m} м/с`;



    // направление ветра

    document.getElementById("weatherDirection").textContent =
        getWindDirection(current.wind_direction_10m);



    // давление

    document.getElementById("weatherPressure").textContent =
        `${Math.round(current.pressure_msl)} гПа`;

}

function getWindDirection(deg){

    const directions = [
        "С",
        "СВ",
        "В",
        "ЮВ",
        "Ю",
        "ЮЗ",
        "З",
        "СЗ"
    ];


    const index = Math.round(deg / 45) % 8;


    return directions[index];

}