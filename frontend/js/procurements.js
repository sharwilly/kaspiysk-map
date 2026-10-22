(() => {
    "use strict";
    // Демонстрационные записи нужны только для проверки интерфейса.
    // Не заменять ими данные реальных закупок: адреса, цены и источники должны подтверждаться ЕИС.
    const DEMO_PROCUREMENTS = [
        { id:"demo-1", title:"Ремонт и благоустройство общественного пространства", category:"building", categoryLabel:"Строительство и ремонт", status:"execution", statusLabel:"Исполнение · пример", address:"Условная точка в центральной части Каспийска", coordinates:[42.8913,47.6397], icon:"▦", color:"#2563eb" },
        { id:"demo-2", title:"Содержание городской территории", category:"utilities", categoryLabel:"Городское хозяйство", status:"procurement", statusLabel:"Закупка · пример", address:"Условная точка в жилом районе", coordinates:[42.8848,47.6354], icon:"♻", color:"#0d9488" },
        { id:"demo-3", title:"Подготовка проектной документации", category:"design", categoryLabel:"Проектирование", status:"planning", statusLabel:"Планирование · пример", address:"Условная точка на карте города", coordinates:[42.8991,47.6480], icon:"⌁", color:"#8b5cf6" }
    ];
    const mapNode = document.getElementById("procurementMap");
    if (!mapNode || typeof L === "undefined") {
        if (mapNode) mapNode.textContent = "Не удалось загрузить карту. Проверьте подключение к Leaflet.";
        return;
    }
    const map = L.map(mapNode, { zoomControl:true, scrollWheelZoom:true }).setView([42.8913,47.6397],13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, attribution:"© OpenStreetMap contributors" }).addTo(map);
    const markerLayer = L.featureGroup().addTo(map);
    const markers = new Map();
    const cardsRoot = document.getElementById("procurementCards");
    const searchInput = document.getElementById("procurementSearch");
    const categoryFilter = document.getElementById("categoryFilter");
    const statusFilter = document.getElementById("statusFilter");
    const emptyState = document.getElementById("emptyState");
    const resultsCount = document.getElementById("resultsCount");
    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
    }
    function makeMarker(item) {
        const marker = L.marker(item.coordinates, { icon:L.divIcon({ className:"procurement-marker", iconSize:[34,34], iconAnchor:[17,17], html:'<span class="procurement-marker-inner" style="background:'+item.color+'">'+item.icon+'</span>' }) });
        marker.bindPopup('<div class="map-popup-title">'+escapeHtml(item.title)+'</div><div class="map-popup-label">Демонстрационная точка · не реальная закупка</div>');
        marker.on("click", () => selectCard(item.id,false));
        marker.addTo(markerLayer);
        markers.set(item.id,marker);
    }
    DEMO_PROCUREMENTS.forEach(makeMarker);
    function cardMarkup(item) {
        const categoryClass = item.category==="utilities" ? "utilities" : item.category==="design" ? "design" : item.category==="infrastructure" ? "infrastructure" : "";
        return '<article class="procurement-card" data-id="'+escapeHtml(item.id)+'" tabindex="0" role="button" aria-label="Показать на карте: '+escapeHtml(item.title)+'">'+
            '<div class="card-topline"><span class="category-tag '+categoryClass+'">'+escapeHtml(item.categoryLabel)+'</span><span class="stage-tag">'+escapeHtml(item.statusLabel)+'</span></div>'+
            '<h3>'+escapeHtml(item.title)+'</h3><div class="card-address"><span>⌖</span><span>'+escapeHtml(item.address)+'</span></div>'+
            '<div class="card-bottom"><span class="card-price">Стоимость не указана</span><span class="card-source">ЕИС не подключена ↗</span></div>'+
            '<span class="card-demo">Демо-пример · сведения не являются реальными</span></article>';
    }
    function selectCard(id, panToMarker=true) {
        document.querySelectorAll(".procurement-card").forEach(card => card.classList.toggle("selected",card.dataset.id===id));
        const marker = markers.get(id);
        if (!marker) return;
        if (panToMarker) map.flyTo(marker.getLatLng(),Math.max(map.getZoom(),15),{duration:.45});
        marker.openPopup();
    }
    function pluralize(n,forms) {
        const mod10=n%10,mod100=n%100;
        if(mod10===1&&mod100!==11)return forms[0];
        if(mod10>=2&&mod10<=4&&(mod100<12||mod100>14))return forms[1];
        return forms[2];
    }
    function render() {
        const query=searchInput.value.trim().toLocaleLowerCase("ru");
        const category=categoryFilter.value,status=statusFilter.value;
        const visible=DEMO_PROCUREMENTS.filter(item=>{
            const text=[item.title,item.address,item.categoryLabel,item.statusLabel].join(" ").toLocaleLowerCase("ru");
            return (!query||text.includes(query))&&(category==="all"||item.category===category)&&(status==="all"||item.status===status);
        });
        cardsRoot.innerHTML=visible.map(cardMarkup).join("");
        emptyState.hidden=visible.length>0;
        resultsCount.textContent=visible.length+" демонстрационных "+pluralize(visible.length,["пример","примера","примеров"]);
        document.getElementById("statTotal").textContent=visible.length;
        cardsRoot.querySelectorAll(".procurement-card").forEach(card=>{
            const activate=()=>selectCard(card.dataset.id);
            card.addEventListener("click",activate);
            card.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();activate();}});
        });
        markerLayer.eachLayer(marker=>marker.setOpacity(visible.some(item=>markers.get(item.id)===marker)?1:.18));
    }
    [searchInput,categoryFilter,statusFilter].forEach(control=>{control.addEventListener("input",render);control.addEventListener("change",render);});
    document.getElementById("resetFilters").addEventListener("click",()=>{searchInput.value="";categoryFilter.value="all";statusFilter.value="all";render();});
    render();
    window.setTimeout(()=>map.invalidateSize(),100);
})();