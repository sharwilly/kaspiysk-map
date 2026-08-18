/* =========================================================
ПРОБЛЕМЫ ГОРОДА — ЕДИНАЯ КАРТА
Включает городские проблемы, собак и отключения.
========================================================= */

if (typeof L === "undefined") throw new Error("Leaflet не загружен");
const problemsApi = typeof API_URL !== "undefined" ? API_URL : "";
const mapElement = document.getElementById("map");
if (!mapElement) throw new Error("Элемент #map отсутствует в HTML");

const map = L.map("map", { maxZoom: 18, minZoom: 12, zoomControl: true }).setView([42.8913, 47.6397], 13);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);

let tempMarker = null, selectedLocation = null, selectedAddress = null, cityBoundary = null;
let problemMarkers = [], outageMarkers = [], currentMapFilter = "all";
let selectedPhotos = [], currentPhotos = [], currentPhotoIndex = 0;
const viewer = document.getElementById("photoViewer"), viewerImage = document.getElementById("viewerImage");

function escapeHtml(value) { return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
function shortAddress(item) {
    const addr = item?.address;
    if (!addr) return item?.display_name || "Адрес не определён";
    let street = addr.road || "";
    if (street.startsWith("улица ")) street = street.replace("улица ", "ул. ");
    if (street.startsWith("проспект ")) street = street.replace("проспект ", "пр-т ");
    if (street.startsWith("переулок ")) street = street.replace("переулок ", "пер. ");
    return street && addr.house_number ? `${street}, ${addr.house_number}` : item.display_name || "Адрес не определён";
}
window.openPhotoViewer = function(photos,index){ if(!Array.isArray(photos)||!photos.length)return; currentPhotos=photos; currentPhotoIndex=index; viewerImage.src=photos[index]; viewer.style.display="flex"; };
function closePhotoViewer(){ if(viewer){viewer.style.display="none";viewerImage.src="";} }
function showNextPhoto(){if(currentPhotos.length){currentPhotoIndex=(currentPhotoIndex+1)%currentPhotos.length;viewerImage.src=currentPhotos[currentPhotoIndex];}}
function showPrevPhoto(){if(currentPhotos.length){currentPhotoIndex=(currentPhotoIndex-1+currentPhotos.length)%currentPhotos.length;viewerImage.src=currentPhotos[currentPhotoIndex];}}
document.getElementById("closeViewer")?.addEventListener("click",closePhotoViewer);
document.getElementById("nextPhoto")?.addEventListener("click",showNextPhoto);
document.getElementById("prevPhoto")?.addEventListener("click",showPrevPhoto);
viewer?.addEventListener("click",e=>{if(e.target===viewer)closePhotoViewer();});

function getProblemIcon(type){return {"подтопление":"💧","яма":"🕳","мусор":"🗑","освещение":"💡","собака":"🐕","другое":"❗",outage:"⚡"}[type]||"❗";}
function getProblemName(type){return {"подтопление":"Подтопление","яма":"Яма","мусор":"Мусор","освещение":"Освещение","собака":"Бездомная собака","другое":"Другое",outage:"Электричество"}[type]||"Обращение";}
function getStatusName(status){return {new:"Новое",accepted:"Принято",in_progress:"В работе",done:"Выполнено",archive:"Архив"}[status]||status||"Неизвестно";}

function createProblemMarker(problem){
    const color={new:"#EF4444",in_progress:"#F59E0B",done:"#22C55E"}[problem.status]||"#EF4444";
    return L.marker([Number(problem.latitude),Number(problem.longitude)],{icon:L.divIcon({className:"problem-marker",html:`<div style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${color};border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,.3);font-size:18px;box-sizing:border-box;">${getProblemIcon(problem.type)}</div>`,iconSize:[34,34],iconAnchor:[17,17],popupAnchor:[0,-17]})});
}
function buildProblemPopup(problem){
    const photos=Array.isArray(problem.photos)?problem.photos:[];
    const gallery=photos.length?`<br><div class="popup-gallery">${photos.map((photo,index)=>`<img src="${escapeHtml(photo)}" class="popup-thumb" alt="Фото" onclick='openPhotoViewer(${JSON.stringify(photos)},${index})'>`).join("")}</div>`:"";
    return `<div class="problem-popup"><div class="problem-title">${getProblemIcon(problem.type)} ${getProblemName(problem.type)}</div><div class="problem-description">${escapeHtml(problem.description||"Описание отсутствует")}</div><br><div>📅 <b>Дата:</b> ${problem.created_at?new Date(problem.created_at).toLocaleDateString("ru-RU"):"неизвестно"}</div><div>📍 <b>Адрес:</b> ${escapeHtml(problem.address||"не определён")}</div>${problem.landmark?`<div>🏷 <b>Ориентир:</b> ${escapeHtml(problem.landmark)}</div>`:""}<div>📌 <b>Статус:</b> ${getStatusName(problem.status)}</div>${gallery}</div>`;
}
function applyMapFilter(){
    problemMarkers.forEach(item=>{const visible=currentMapFilter==="all"||currentMapFilter===item.type;if(visible){if(!map.hasLayer(item.marker))item.marker.addTo(map);}else if(map.hasLayer(item.marker))map.removeLayer(item.marker);});
    outageMarkers.forEach(marker=>{const visible=currentMapFilter==="all"||currentMapFilter==="outage";if(visible){if(!map.hasLayer(marker))marker.addTo(map);}else if(map.hasLayer(marker))map.removeLayer(marker);});
}
async function loadProblemsOnMap(){
    try{
        const response=await fetch(`${problemsApi}/problems/active`);if(!response.ok)throw new Error(`HTTP ${response.status}`);const problems=await response.json();
        problemMarkers.forEach(item=>{if(map.hasLayer(item.marker))map.removeLayer(item.marker);});problemMarkers=[];
        problems.forEach(problem=>{if(problem.status==="done"||problem.latitude==null||problem.longitude==null)return;const marker=createProblemMarker(problem);marker.bindPopup(buildProblemPopup(problem));if(currentMapFilter==="all"||currentMapFilter===problem.type)marker.addTo(map);problemMarkers.push({marker,type:problem.type});});applyMapFilter();
    }catch(error){console.error("❌ Ошибка загрузки обращений:",error);}
}

document.querySelectorAll(".map-filter").forEach(button=>button.addEventListener("click",function(){document.querySelectorAll(".map-filter").forEach(btn=>btn.classList.remove("active"));this.classList.add("active");currentMapFilter=this.dataset.filter;applyMapFilter();}));

function createOutageIcon(){return L.divIcon({className:"outage-marker",html:`<div class="outage-marker-inner">⚡</div>`,iconSize:[38,38],iconAnchor:[19,19],popupAnchor:[0,-20]});}
async function loadOutagesOnMap(){
    try{const response=await fetch(`${problemsApi}/outages/map`);if(!response.ok)throw new Error(`HTTP ${response.status}`);const outages=await response.json();outageMarkers.forEach(m=>{if(map.hasLayer(m))map.removeLayer(m);});outageMarkers=[];outages.forEach(outage=>{if(!Array.isArray(outage.locations))return;outage.locations.forEach(location=>{if(location.latitude==null||location.longitude==null)return;const marker=L.marker([Number(location.latitude),Number(location.longitude)],{icon:createOutageIcon()});marker.bindPopup(`<div class="outage-popup"><div class="outage-title">⚡ Отключение электроэнергии</div><div class="outage-address">📍 <b>${escapeHtml(location.address||"Адрес не указан")}</b></div><div class="outage-description">${escapeHtml(outage.description||"Аварийное отключение")}</div><div class="outage-time">${outage.restore_time?`Ожидаемое восстановление: <b>${escapeHtml(outage.restore_time)}</b>`:"Время восстановления неизвестно"}</div></div>`);if(currentMapFilter==="all"||currentMapFilter==="outage")marker.addTo(map);outageMarkers.push(marker);});});applyMapFilter();}catch(error){console.error("❌ Ошибка загрузки отключений:",error);}
}
async function loadCityBoundary(){try{const response=await fetch("data/kaspiysk_boundary.geojson");if(!response.ok)throw new Error(`HTTP ${response.status}`);cityBoundary=await response.json();const boundary=L.geoJSON(cityBoundary,{style:{color:"#0d6efd",weight:3,opacity:1,fillColor:"#0d6efd",fillOpacity:.03},interactive:false}).addTo(map);boundary.bringToBack();const bounds=boundary.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[20,20]});}catch(error){console.error("❌ Ошибка загрузки границы города:",error);}}

map.on("click",async e=>{if(!cityBoundary)return alert("Граница города ещё не загружена");const point=turf.point([e.latlng.lng,e.latlng.lat]);if(!turf.booleanPointInPolygon(point,cityBoundary))return alert("Обращение можно создать только в пределах Каспийска");const{lat:latitude,lng:longitude}=e.latlng;selectedLocation={latitude,longitude};selectedAddress="Получение адреса...";if(tempMarker)map.removeLayer(tempMarker);tempMarker=L.marker([latitude,longitude]).addTo(map).bindTooltip("📍 Получение адреса...",{permanent:true,direction:"top",offset:[0,-10]}).openTooltip();try{const response=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`,{headers:{"User-Agent":"KaspiyskMap/1.0"}});if(response.ok)selectedAddress=shortAddress(await response.json());}catch(error){selectedAddress="Адрес не определён";}tempMarker.unbindTooltip().bindTooltip("📍 "+selectedAddress,{permanent:true,direction:"top",offset:[0,-10]}).openTooltip();document.getElementById("addressResults").innerHTML="Выбрано: 📍 "+escapeHtml(selectedAddress);});

document.getElementById("findAddress")?.addEventListener("click",async()=>{const text=document.getElementById("problemAddress").value.trim(),container=document.getElementById("addressResults");if(!text)return alert("Введите адрес");container.innerHTML="🔎 Ищем адрес...";try{const response=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&q=${encodeURIComponent(`${text}, Каспийск, Республика Дагестан, Россия`)}&limit=50`,{headers:{"User-Agent":"KaspiyskMap/1.0"}});if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();const filtered=data.filter(item=>item.address?.road&&item.address.house_number&&(item.address.city==="Каспийск"||item.address.town==="Каспийск"||item.address.municipality==="Каспийск"));if(!filtered.length)return void(container.innerHTML="Адрес не найден");const unique=filtered.filter((item,index,self)=>{const key=item.address.road+"_"+item.address.house_number;return index===self.findIndex(t=>t.address.road+"_"+t.address.house_number===key);});if(unique.length===1)return selectAddressResult(unique[0]);container.innerHTML="";unique.forEach(item=>{const button=document.createElement("button");button.type="button";button.textContent="📍 "+shortAddress(item);button.addEventListener("click",()=>selectAddressResult(item));container.appendChild(button);});}catch(error){console.error(error);container.innerHTML="Ошибка поиска адреса";}});
function selectAddressResult(item){const latitude=Number(item.lat),longitude=Number(item.lon);if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return alert("У адреса нет корректных координат");selectedLocation={latitude,longitude};selectedAddress=shortAddress(item);if(tempMarker)map.removeLayer(tempMarker);tempMarker=L.marker([latitude,longitude]).addTo(map).bindTooltip("📍 "+selectedAddress,{permanent:true,direction:"top",offset:[0,-10]}).openTooltip();map.setView([latitude,longitude],17);document.getElementById("addressResults").innerHTML="Выбрано: 📍 "+escapeHtml(selectedAddress);}

function setFilter(filter){const button=document.querySelector(`.map-filter[data-filter="${CSS.escape(filter)}"]`);if(!button)return;document.querySelectorAll(".map-filter").forEach(btn=>btn.classList.remove("active"));button.classList.add("active");currentMapFilter=filter;applyMapFilter();}

async function applyQueryParameters(){const params=new URLSearchParams(window.location.search);const type=params.get("type");const address=params.get("address");if(address){const input=document.getElementById("problemAddress");if(input)input.value=address;}if(type)setFilter(type);}

document.getElementById("saveProblem")?.addEventListener("click",async()=>{const saveButton=document.getElementById("saveProblem"),serverNotice=document.getElementById("serverNotice");if(!selectedLocation)return alert("Укажите место на карте или введите адрес");const type=document.getElementById("problemType").value,description=document.getElementById("problemDescription").value.trim();if(!type)return alert("Выберите тип обращения");if(selectedPhotos.length>3)return alert("Можно загрузить максимум 3 фотографии");const formData=new FormData();formData.append("type",type);formData.append("description",description);formData.append("longitude",selectedLocation.longitude);formData.append("latitude",selectedLocation.latitude);if(selectedAddress)formData.append("address",selectedAddress);selectedPhotos.forEach(file=>formData.append("photos",file));saveButton.disabled=true;saveButton.textContent="⏳ Отправляем...";const timer=setTimeout(()=>serverNotice?.classList.remove("hidden"),10000);try{const response=await fetch(`${problemsApi}/problems`,{method:"POST",body:formData});if(!response.ok){let message=`HTTP ${response.status}`;try{const data=await response.json();message=data.error||data.message||message;}catch(_){}throw new Error(message);}const problem=await response.json();clearTimeout(timer);serverNotice?.classList.add("hidden");if(problem.latitude!=null&&problem.longitude!=null){const marker=createProblemMarker(problem);marker.bindPopup(buildProblemPopup(problem));marker.addTo(map);problemMarkers.push({marker,type:problem.type});applyMapFilter();}selectedPhotos=[];renderPhotoPreview();document.getElementById("problemDescription").value="";document.getElementById("photos").value="";document.querySelectorAll(".type-button").forEach(btn=>btn.classList.remove("active"));document.getElementById("problemType").value="";if(tempMarker)map.removeLayer(tempMarker);tempMarker=null;selectedLocation=null;selectedAddress=null;document.getElementById("addressResults").innerHTML="";showSuccessMessage(problem.id);}catch(error){clearTimeout(timer);serverNotice?.classList.add("hidden");console.error(error);alert("Не удалось отправить обращение.\n\n"+error.message);}finally{saveButton.disabled=false;saveButton.textContent="🚀 Отправить обращение";}});

document.querySelectorAll(".type-button").forEach(button=>button.addEventListener("click",function(){document.querySelectorAll(".type-button").forEach(btn=>btn.classList.remove("active"));this.classList.add("active");document.getElementById("problemType").value=this.dataset.type;}));

document.getElementById("myLocation")?.addEventListener("click",()=>{if(!navigator.geolocation)return alert("Геолокация не поддерживается вашим браузером");navigator.geolocation.getCurrentPosition(async position=>{const{latitude,longitude}=position.coords;if(cityBoundary&&!turf.booleanPointInPolygon(turf.point([longitude,latitude]),cityBoundary))return alert("Ваше местоположение находится за пределами Каспийска");selectedLocation={latitude,longitude};selectedAddress="Моё местоположение";if(tempMarker)map.removeLayer(tempMarker);tempMarker=L.marker([latitude,longitude]).addTo(map).bindPopup("📍 Вы здесь").openPopup();map.setView([latitude,longitude],17);document.getElementById("addressResults").innerHTML="Выбрано: 📍 Моё местоположение";try{const response=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`,{headers:{"User-Agent":"KaspiyskMap/1.0"}});if(response.ok){selectedAddress=shortAddress(await response.json());document.getElementById("addressResults").innerHTML="Выбрано: 📍 "+escapeHtml(selectedAddress);}}catch(error){console.warn(error);}},error=>alert({1:"Доступ к геолокации запрещён.",2:"Местоположение сейчас недоступно.",3:"Время ожидания геолокации истекло."}[error.code]||"Не удалось определить местоположение"),{enableHighAccuracy:true,timeout:10000,maximumAge:60000});});

const photoInput=document.getElementById("photos"),photoPreview=document.getElementById("photoPreview");
photoInput?.addEventListener("change",()=>{const files=Array.from(photoInput.files||[]);if(selectedPhotos.length+files.length>3){alert("Можно загрузить максимум 3 фотографии");selectedPhotos=[...selectedPhotos,...files].slice(0,3);}else selectedPhotos=[...selectedPhotos,...files];renderPhotoPreview();});
function renderPhotoPreview(){if(!photoPreview)return;photoPreview.innerHTML="";selectedPhotos.forEach((file,index)=>{const url=URL.createObjectURL(file),block=document.createElement("div"),image=document.createElement("img"),remove=document.createElement("button");block.className="photo-item";image.src=url;image.alt="Предпросмотр";remove.type="button";remove.textContent="❌";remove.addEventListener("click",()=>{URL.revokeObjectURL(url);selectedPhotos.splice(index,1);renderPhotoPreview();});block.append(image,remove);photoPreview.appendChild(block);});}
function showSuccessMessage(id){const panel=document.getElementById("panel");if(!panel)return;const success=document.createElement("div");success.className="success-message";success.innerHTML=`<div>✅ Спасибо!<br><small>Обращение #${escapeHtml(id)} добавлено на карту.</small></div>`;panel.appendChild(success);setTimeout(()=>success.remove(),3000);}

Promise.allSettled([loadCityBoundary(),loadProblemsOnMap(),loadOutagesOnMap()]).then(applyQueryParameters);
