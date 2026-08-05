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


}