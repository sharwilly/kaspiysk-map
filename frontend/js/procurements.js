(() => {
    "use strict";

    const DEMO_MODE = new URLSearchParams(window.location.search).get("demo") === "1";
    const DEMO_ITEMS = [
        { id:"demo-1", title:"Ремонт и благоустройство общественного пространства", category:"building", categoryLabel:"Строительство и ремонт", status:"execution", statusLabel:"Исполнение · пример", address:"Условная точка в центральной части Каспийска", latitude:42.8913, longitude:47.6397, price:null, customer:"Демонстрационный заказчик", contractNumber:null, sourceName:"Демо", sourceUrl:"https://zakupki.gov.ru/", locationVerified:false, notes:"Это вымышленная запись для проверки интерфейса." },
        { id:"demo-2", title:"Содержание городской территории", category:"utilities", categoryLabel:"Городское хозяйство", status:"procurement", statusLabel:"Закупка · пример", address:"Условная точка в жилом районе", latitude:42.8848, longitude:47.6354, price:null, customer:"Демонстрационный заказчик", contractNumber:null, sourceName:"Демо", sourceUrl:"https://zakupki.gov.ru/", locationVerified:false, notes:"Это вымышленная запись для проверки интерфейса." },
        { id:"demo-3", title:"Подготовка проектной документации", category:"design", categoryLabel:"Проектирование", status:"planning", statusLabel:"Планирование · пример", address:"Условная точка на карте города", latitude:42.8991, longitude:47.6480, price:null, customer:"Демонстрационный заказчик", contractNumber:null, sourceName:"Демо", sourceUrl:"https://zakupki.gov.ru/", locationVerified:false, notes:"Это вымышленная запись для проверки интерфейса." }
    ];

    const mapNode = document.getElementById("procurementMap");
    if (!mapNode || typeof L === "undefined") {
        if (mapNode) mapNode.textContent = "Не удалось загрузить карту. Проверьте подключение к Leaflet.";
        return;
    }

    const map = L.map(mapNode, { zoomControl:true, scrollWheelZoom:true }).setView([42.8913,47.6397],13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom:19,
        attribution:"© OpenStreetMap contributors"
    }).addTo(map);

    const markerLayer = L.featureGroup().addTo(map);
    const markers = new Map();
    const cardsRoot = document.getElementById("procurementCards");
    const searchInput = document.getElementById("procurementSearch");
    const categoryFilter = document.getElementById("categoryFilter");
    const statusFilter = document.getElementById("statusFilter");
    const emptyState = document.getElementById("emptyState");
    const emptyTitle = emptyState.querySelector("strong");
    const emptyDescription = emptyState.querySelector("p");
    const resultsCount = document.getElementById("resultsCount");
    const notice = document.getElementById("procurementNotice");
    const modeLabel = document.getElementById("mapModeLabel");
    const statTotal = document.getElementById("statTotal");
    const statCategories = document.getElementById("statCategories");
    const statCaption = document.getElementById("statCaption");
    let allItems = [];
    let loadingFailed = false;

    if (DEMO_MODE) {
        notice.innerHTML = '<span class="demo-notice-icon">!</span><div><strong>Демо-режим включён.</strong> Все записи и точки на карте вымышлены и не являются реальными закупками. Уберите <code>?demo=1</code> из адреса, чтобы открыть рабочий режим.</div>';
        modeLabel.textContent = "Демо-режим";
    } else {
        notice.innerHTML = '<span class="demo-notice-icon">i</span><div><strong>Показываем только проверенные записи.</strong> В реестре появятся закупки со ссылкой на первичный документ. Адрес и координаты отображаются отдельно от факта закупки и требуют подтверждения.</div>';
        modeLabel.textContent = "Проверенный реестр";
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
        })[char]);
    }

    function formatPrice(value) {
        const price = Number(value);
        if (value === null || value === undefined || value === "" || !Number.isFinite(price)) {
            return "Стоимость не указана";
        }
        return new Intl.NumberFormat("ru-RU", { style:"currency", currency:"RUB", maximumFractionDigits:0 }).format(price);
    }

    function hasCoordinates(item) {
        return Number.isFinite(Number(item.latitude)) && Number(item.latitude) >= -90 && Number(item.latitude) <= 90 &&
            Number.isFinite(Number(item.longitude)) && Number(item.longitude) >= -180 && Number(item.longitude) <= 180 &&
            item.latitude !== null && item.longitude !== null;
    }

    function markerStyle(item) {
        if (item.category === "utilities") return { color:"#0d9488", icon:"♻" };
        if (item.category === "design") return { color:"#8b5cf6", icon:"⌁" };
        if (item.category === "infrastructure") return { color:"#ea580c", icon:"⌂" };
        return { color:"#2563eb", icon:"▦" };
    }

    function makeMarker(item) {
        if (!hasCoordinates(item)) return;
        const style = markerStyle(item);
        const marker = L.marker([Number(item.latitude),Number(item.longitude)], {
            icon:L.divIcon({
                className:"procurement-marker",
                iconSize:[34,34],
                iconAnchor:[17,17],
                html:'<span class="procurement-marker-inner" style="background:'+style.color+'">'+style.icon+'</span>'
            })
        });
        const locationLabel = item.locationVerified ? "Координаты подтверждены" : "Координаты требуют проверки";
        marker.bindPopup('<div class="map-popup-title">'+escapeHtml(item.title)+'</div><div class="map-popup-label">'+escapeHtml(locationLabel)+'</div>');
        marker.on("click",() => selectCard(item.id,false));
        marker.addTo(markerLayer);
        markers.set(String(item.id),marker);
    }

    function cardMarkup(item) {
        const categoryClass = item.category === "utilities" ? "utilities" :
            item.category === "design" ? "design" :
            item.category === "infrastructure" ? "infrastructure" : "";
        const coordinatesText = hasCoordinates(item)
            ? (item.locationVerified ? "Координаты подтверждены" : "Координаты требуют проверки")
            : "Точное место не определено";
        const customer = item.customer ? '<div class="card-meta">Заказчик: '+escapeHtml(item.customer)+'</div>' : "";
        const purchase = item.purchaseNumber ? '<div class="card-meta">Номер закупки: '+escapeHtml(item.purchaseNumber)+'</div>' : "";
        const contract = item.contractNumber ? '<div class="card-meta">Номер контракта: '+escapeHtml(item.contractNumber)+'</div>' : "";
        const locationSource = item.locationSourceUrl ? '<div class="card-meta"><a class="card-location-source" href="'+escapeHtml(item.locationSourceUrl)+'" target="_blank" rel="noopener noreferrer">Источник координат: '+escapeHtml(item.locationSourceName || "картографический справочник")+' ↗</a></div>' : "";
        const notes = item.notes ? '<p class="card-notes">'+escapeHtml(item.notes)+'</p>' : "";
        return '<article class="procurement-card" data-id="'+escapeHtml(item.id)+'" tabindex="0" role="button" aria-label="Показать на карте: '+escapeHtml(item.title)+'">'+
            '<div class="card-topline"><span class="category-tag '+categoryClass+'">'+escapeHtml(item.categoryLabel || "Другое")+'</span><span class="stage-tag">'+escapeHtml(item.statusLabel || "Статус не подтверждён")+'</span></div>'+
            '<h3>'+escapeHtml(item.title)+'</h3>'+
            '<div class="card-address"><span>⌖</span><span>'+escapeHtml(item.address || "Адрес не указан")+'</span></div>'+
            '<div class="card-meta">'+escapeHtml(coordinatesText)+'</div>'+locationSource+customer+purchase+contract+notes+
            '<div class="card-bottom"><span class="card-price">'+escapeHtml(formatPrice(item.price))+'</span><a class="card-source" href="'+escapeHtml(item.sourceUrl)+'" target="_blank" rel="noopener noreferrer">Первичный источник ↗</a></div>'+
            (DEMO_MODE ? '<span class="card-demo">Демо-пример · не реальная закупка</span>' : '')+
            '</article>';
    }

    function selectCard(id, panToMarker=true) {
        document.querySelectorAll(".procurement-card").forEach(card => card.classList.toggle("selected",String(card.dataset.id)===String(id)));
        const marker = markers.get(String(id));
        if (!marker) return;
        if (panToMarker) map.flyTo(marker.getLatLng(),Math.max(map.getZoom(),15),{duration:.45});
        marker.openPopup();
    }

    function updateEisSearchLink() {
        const link = document.getElementById("eisSearchLink");
        if (!link) return;
        const term = searchInput.value.trim();
        const query = term ? "Каспийск " + term : "Каспийск";
        link.href = "https://zakupki.gov.ru/epz/order/extendedsearch/results.html?searchString=" + encodeURIComponent(query);
    }

    function pluralize(n,forms) {
        const mod10=n%10,mod100=n%100;
        if(mod10===1&&mod100!==11)return forms[0];
        if(mod10>=2&&mod10<=4&&(mod100<12||mod100>14))return forms[1];
        return forms[2];
    }

    function render() {
        const query=searchInput.value.trim().toLocaleLowerCase("ru");
        const category=categoryFilter.value;
        const status=statusFilter.value;
        const filtered=allItems.filter(item=>{
            const text=[item.title,item.address,item.customer,item.contractNumber,item.categoryLabel,item.statusLabel].filter(Boolean).join(" ").toLocaleLowerCase("ru");
            return (!query||text.includes(query))&&(category==="all"||item.category===category)&&(status==="all"||item.status===status);
        });

        cardsRoot.innerHTML=filtered.map(cardMarkup).join("");
        emptyState.hidden=filtered.length>0;
        if (filtered.length === 0) {
            if (loadingFailed) {
                emptyTitle.textContent="Не удалось загрузить реестр";
                emptyDescription.textContent="Проверьте доступность API и попробуйте обновить страницу.";
            } else if (allItems.length === 0 && !DEMO_MODE) {
                emptyTitle.textContent="Проверенных закупок пока нет";
                emptyDescription.textContent="Мы не показываем вымышленные контракты. Когда появятся записи с первичными источниками, они отобразятся здесь.";
            } else {
                emptyTitle.textContent="Ничего не найдено";
                emptyDescription.textContent="Измените поисковый запрос или фильтры.";
            }
        }

        resultsCount.textContent=filtered.length+" "+(DEMO_MODE ? "демонстрационных " : "")+pluralize(filtered.length,["запись","записи","записей"]);
        statTotal.textContent=allItems.length;
        statCategories.textContent=new Set(allItems.map(item=>item.category).filter(Boolean)).size;
        statCaption.textContent=DEMO_MODE ? "вымышленные примеры" : "записей в текущем реестре";

        cardsRoot.querySelectorAll(".procurement-card").forEach(card=>{
            const activate=()=>selectCard(card.dataset.id);
            card.addEventListener("click",event=>{
                if (event.target.closest("a")) return;
                activate();
            });
            card.addEventListener("keydown",event=>{
                if(event.key==="Enter"||event.key===" "){event.preventDefault();activate();}
            });
        });

        markerLayer.eachLayer(marker=>{
            const item = allItems.find(record=>String(record.id)===String([...markers.entries()].find(([,value])=>value===marker)?.[0]));
            marker.setOpacity(item && filtered.some(record=>String(record.id)===String(item.id)) ? 1 : .18);
        });
    }

    async function loadItems() {
        if (DEMO_MODE) {
            allItems = DEMO_ITEMS;
            DEMO_ITEMS.forEach(makeMarker);
            render();
            return;
        }

        const apiBase = typeof API_URL === "string" ? API_URL.replace(/\/$/,"") : "";
        if (!apiBase) {
            loadingFailed = true;
            render();
            return;
        }

        try {
            const response = await fetch(apiBase + "/procurements", { headers:{ "Accept":"application/json" } });
            if (!response.ok) throw new Error("API returned " + response.status);
            const payload = await response.json();
            allItems = Array.isArray(payload.items) ? payload.items.filter(item =>
                item && item.published !== false &&
                typeof item.id !== "undefined" &&
                typeof item.title === "string" &&
                typeof item.sourceUrl === "string" &&
                /^https:\/\//i.test(item.sourceUrl)
            ) : [];
            allItems.forEach(makeMarker);
            if (allItems.some(hasCoordinates)) {
                map.fitBounds(markerLayer.getBounds().pad(.15), { maxZoom:14 });
            }
        } catch (error) {
            console.error("Не удалось загрузить реестр закупок:",error);
            loadingFailed = true;
        }
        render();
    }

    [searchInput,categoryFilter,statusFilter].forEach(control=>{
        control.addEventListener("input",render);
        control.addEventListener("change",render);
    });
    searchInput.addEventListener("input",updateEisSearchLink);
    updateEisSearchLink();
    document.getElementById("resetFilters").addEventListener("click",()=>{
        searchInput.value="";
        categoryFilter.value="all";
        statusFilter.value="all";
        updateEisSearchLink();
        render();
    });

    loadItems();
    window.setTimeout(()=>map.invalidateSize(),100);
})();