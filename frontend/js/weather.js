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

        console.log(data);

    }
    catch(error){

        console.error(
            "Ошибка загрузки погоды:",
            error
        );

    }

}