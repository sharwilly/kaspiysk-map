const LAT = 42.8913;
const LON = 47.6397;



const weatherCodes = {

    0:{
        icon:"☀️",
        text:"Ясно"
    },

    1:{
        icon:"🌤",
        text:"Преимущественно ясно"
    },

    2:{
        icon:"⛅",
        text:"Переменная облачность"
    },

    3:{
        icon:"☁️",
        text:"Пасмурно"
    },

    45:{
        icon:"🌫",
        text:"Туман"
    },

    48:{
        icon:"🌫",
        text:"Изморозь"
    },

    51:{
        icon:"🌦",
        text:"Морось"
    },

    61:{
        icon:"🌧",
        text:"Дождь"
    },

    63:{
        icon:"🌧",
        text:"Умеренный дождь"
    },

    65:{
        icon:"🌧",
        text:"Сильный дождь"
    },

    71:{
        icon:"🌨",
        text:"Снег"
    },

    80:{
        icon:"🌦",
        text:"Ливень"
    },

    95:{
        icon:"⛈",
        text:"Гроза"
    },

    96:{
        icon:"⛈",
        text:"Гроза с градом"
    },

    99:{
        icon:"⛈",
        text:"Сильная гроза"
    }

};





async function loadWeatherPage(){


    try{


        const url =

        `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,pressure_msl,weather_code&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset&timezone=Europe/Moscow`;



        const response = await fetch(url);


        const data = await response.json();



        renderCurrent(data);


        renderHourly(data);


        renderDaily(data);


        renderSun(data);



    }


    catch(error){


        console.error(
            "Ошибка загрузки погоды:",
            error
        );


    }


}









function renderCurrent(data){


    const current = data.current;


    const weather =
    weatherCodes[current.weather_code]
    ||
    {
        icon:"🌤",
        text:"Неизвестно"
    };



    document.getElementById("weatherIcon").textContent =
    weather.icon;



    document.getElementById("weatherTemp").textContent =
    Math.round(current.temperature_2m)+"°";



    document.getElementById("weatherDescription").textContent =
    weather.text;



    document.getElementById("weatherFeels").textContent =
    "Ощущается как "+
    Math.round(current.apparent_temperature)+"°";



    document.getElementById("humidity").textContent =
    current.relative_humidity_2m+"%";



    document.getElementById("wind").textContent =
    current.wind_speed_10m+" м/с";



    document.getElementById("direction").textContent =
    getWindDirection(
        current.wind_direction_10m
    );



    document.getElementById("pressure").textContent =
    Math.round(current.pressure_msl)+" гПа";



    setWeatherTheme(
        current.weather_code
    );


}









function renderHourly(data){


    const container =
    document.getElementById(
        "hourlyForecast"
    );



    container.innerHTML="";



    const now =
    new Date();



    let start = 0;



    for(let i=0;i<data.hourly.time.length;i++){


        if(
            new Date(data.hourly.time[i])
            >= now
        ){

            start=i;

            break;

        }


    }




    for(
        let i=start;
        i<start+12;
        i++
    ){


        const weather =
        weatherCodes[
            data.hourly.weather_code[i]
        ]
        ||
        {
            icon:"🌤"
        };



        container.innerHTML += `

        <div class="hour-card">

            <div class="hour-time">

            ${data.hourly.time[i]
            .slice(11,16)}

            </div>


            <div class="hour-icon">

            ${weather.icon}

            </div>


            <div class="hour-temp">

            ${Math.round(
                data.hourly.temperature_2m[i]
            )}°

            </div>


        </div>

        `;


    }


}









function renderDaily(data){


    const container =
    document.getElementById(
        "dailyForecast"
    );



    container.innerHTML="";



    const days =
    [
        "Вс",
        "Пн",
        "Вт",
        "Ср",
        "Чт",
        "Пт",
        "Сб"
    ];



    for(let i=0;i<7;i++){


        const date =
        new Date(
            data.daily.time[i]
        );



        const weather =
        weatherCodes[
            data.daily.weather_code[i]
        ]
        ||
        {
            icon:"🌤"
        };



        container.innerHTML += `


        <div class="day-card">


            <div class="day-name">

            ${days[date.getDay()]}

            </div>



            <div class="day-icon">

            ${weather.icon}

            </div>



            <div class="day-temp">

            ${Math.round(
                data.daily.temperature_2m_max[i]
            )}°

            /
            ${Math.round(
                data.daily.temperature_2m_min[i]
            )}°

            </div>


        </div>


        `;


    }


}









function renderSun(data){


    document.getElementById("sunrise").textContent =
    data.daily.sunrise[0]
    .slice(11,16);



    document.getElementById("sunset").textContent =
    data.daily.sunset[0]
    .slice(11,16);



}









function getWindDirection(deg){


    const directions =
    [
        "С",
        "СВ",
        "В",
        "ЮВ",
        "Ю",
        "ЮЗ",
        "З",
        "СЗ"
    ];



    return directions[
        Math.round(deg/45)%8
    ];

}









function setWeatherTheme(code){


    const hero =
    document.getElementById(
        "weatherHero"
    );



    if(!hero)
    return;



    if(code===0){


        hero.style.background =
        "linear-gradient(135deg,#56CCF2,#2F80ED)";


    }


    else if(code===2 || code===3){


        hero.style.background =
        "linear-gradient(135deg,#757F9A,#D7DDE8)";


    }


    else if(code>=61 && code<=80){


        hero.style.background =
        "linear-gradient(135deg,#4B79A1,#283E51)";


    }


    else if(code>=95){


        hero.style.background =
        "linear-gradient(135deg,#232526,#414345)";


    }


}








document.addEventListener(
"DOMContentLoaded",
()=>{


    loadWeatherPage();


});