const weatherBtn = document.getElementById("weatherBtn");
const weatherPopover = document.getElementById("weatherPopover");


if(weatherBtn && weatherPopover){

    weatherBtn.addEventListener("click", (e)=>{

        e.stopPropagation();

        weatherPopover.classList.toggle("hidden");

    });


    document.addEventListener("click",(e)=>{

        if(
            !weatherPopover.contains(e.target) &&
            !weatherBtn.contains(e.target)
        ){

            weatherPopover.classList.add("hidden");

        }

    });

}