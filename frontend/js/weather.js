const lat = 42.8913;
const lon = 47.6397;



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


61:{
icon:"🌧",
text:"Дождь"
},


80:{
icon:"🌦",
text:"Ливень"
},


95:{
icon:"⛈",
text:"Гроза"
}


};





async function loadWeatherPage(){


const url =

`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,pressure_msl,weather_code&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code,sunrise,sunset&timezone=Europe/Moscow`;



const response = await fetch(url);


const data = await response.json();



renderCurrent(data);

renderHourly(data);

renderDaily(data);

renderSun(data);


}






function renderCurrent(data){


const current=data.current;


const weather =
weatherCodes[current.weather_code] ||
{
icon:"🌤",
text:""
};



document.getElementById("weatherIcon").textContent =
weather.icon;



document.getElementById("weatherTemp").textContent =
Math.round(current.temperature_2m)+"°C";



document.getElementById("weatherDescription").textContent =
weather.text;



document.getElementById("weatherFeels").textContent =
"Ощущается как "+
Math.round(current.apparent_temperature)+"°C";



document.getElementById("humidity").textContent =
current.relative_humidity_2m+"%";



document.getElementById("wind").textContent =
current.wind_speed_10m+" м/с";



document.getElementById("pressure").textContent =
Math.round(current.pressure_msl)+" гПа";


}






function renderHourly(data){


const box =
document.getElementById("hourlyForecast");


box.innerHTML="";



for(let i=0;i<12;i++){


const weather =
weatherCodes[data.hourly.weather_code[i]]
||
{
icon:"🌤"
};



box.innerHTML += `

<div class="hour-card">

<div>
${data.hourly.time[i].slice(11,16)}
</div>


<div class="icon">
${weather.icon}
</div>


<strong>
${Math.round(data.hourly.temperature_2m[i])}°
</strong>


</div>

`;


}



}








function renderDaily(data){


const box =
document.getElementById("dailyForecast");


box.innerHTML="";



for(let i=0;i<7;i++){


const weather =
weatherCodes[data.daily.weather_code[i]]
||
{
icon:"🌤"
};



const date =
new Date(data.daily.time[i])
.toLocaleDateString(
"ru-RU",
{
weekday:"short"
}
);



box.innerHTML += `


<div class="day-card">


<strong>
${date}
</strong>


<div class="icon">

${weather.icon}

</div>


<div>

${Math.round(data.daily.temperature_2m_max[i])}°
/
${Math.round(data.daily.temperature_2m_min[i])}°

</div>


</div>


`;



}


}






function renderSun(data){


document.getElementById("sunrise").textContent =
data.daily.sunrise[0].slice(11,16);


document.getElementById("sunset").textContent =
data.daily.sunset[0].slice(11,16);


}





document.addEventListener(
"DOMContentLoaded",
()=>{

loadWeatherPage();

}
);