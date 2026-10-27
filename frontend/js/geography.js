(() => {
  const dagestanBounds = L.latLngBounds([[40.9, 45.0], [44.9, 49.2]]);
  const map = L.map('dagestan-map', { zoomControl: true, scrollWheelZoom: false, attributionControl: false, maxBounds: dagestanBounds, maxBoundsViscosity: 1.0, minZoom: 6, maxZoom: 10 }).setView([42.45, 47.2], 7);
  map.setMaxBounds(dagestanBounds);
  L.control.attribution({ prefix: false }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 12, attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const statusEl = document.getElementById('mapStatus');
  const optionsEl = document.getElementById('answerOptions');
  const feedbackEl = document.getElementById('feedback');
  const nextBtn = document.getElementById('nextQuestion');
  const scoreLabel = document.getElementById('scoreLabel');
  const questionNumber = document.getElementById('questionNumber');
  const livesLabel = document.getElementById('livesLabel');
  const timerLabel = document.getElementById('timerLabel');
  const modeButtons = [...document.querySelectorAll('.mode-button')];
  let districts = [], layersByName = new Map(), target = null, answered = false, question = 0, score = 0, lives = 3, gameOver = false;
  let mode = 'training', timeLeft = 60, timerId = null, mistakes = 0;

  function updateLives() {
    if (mode === 'training') {
      livesLabel.textContent = 'Без ограничений';
      livesLabel.setAttribute('aria-label', 'Режим обучения без ограничения жизней');
      livesLabel.classList.remove('no-lives');
      return;
    }
    livesLabel.textContent = 'Жизни: ' + '♥ '.repeat(lives) + '♡ '.repeat(3 - lives);
    livesLabel.setAttribute('aria-label', 'Осталось жизней: ' + lives + ' из 3');
    livesLabel.classList.toggle('no-lives', lives === 1);
  }

  function stopTimer() { if (timerId !== null) clearInterval(timerId); timerId = null; }
  function updateTimer() {
    timerLabel.textContent = String(Math.floor(timeLeft / 60)).padStart(2, '0') + ':' + String(timeLeft % 60).padStart(2, '0');
    timerLabel.classList.toggle('urgent', timeLeft <= 10);
  }
  function finishTimedGame(reason) {
    if (gameOver) return;
    gameOver = true; answered = true; stopTimer();
    [...optionsEl.querySelectorAll('button')].forEach(button => button.disabled = true);
    feedbackEl.textContent = reason + ' Итог: ' + score + ' верных ответов из ' + question + ', ошибок: ' + mistakes + '.';
    feedbackEl.className = 'feedback ' + (reason.startsWith('Время') ? 'bad' : 'neutral');
    nextBtn.disabled = false;
    nextBtn.innerHTML = 'Играть ещё раз <span aria-hidden="true">↻</span>';
  }
  function startTimer() {
    stopTimer(); timeLeft = 60; updateTimer();
    timerId = setInterval(() => { timeLeft--; updateTimer(); if (timeLeft <= 0) finishTimedGame('Время вышло!'); }, 1000);
  }
  function setMode(nextMode) {
    mode = nextMode;
    modeButtons.forEach(button => { const active = button.dataset.mode === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    timerLabel.hidden = mode !== 'timed';
    resetGame();
  }
  function resetGame() {
    stopTimer(); question = 0; score = 0; lives = 3; mistakes = 0; gameOver = false; answered = false;
    scoreLabel.textContent = 'Верных ответов: 0'; updateLives();
    if (mode === 'timed') startTimer();
    beginQuestion();
  }

  const nameOf = f => {
    const p = f.properties || {};
    return p.district || p['name:ru'] || p.name || p['official_name:ru'] || p.official_name ||
      p.shapeName || p.NAME_2 || p.NAME_1 || p.NAME || p.name_ru ||
      p['name:en'] || p.NAME_EN || '';
  };
  // Administrative centers from the Dagestan municipal-district reference list.
  // Coordinates are resolved from OpenStreetMap's geocoder on demand and cached.
  const administrativeCenters = {
    'Агульский район': 'Тпиг',
    'Акушинский район': 'Акуша',
    'Ахвахский район': 'Карата',
    'Ахтынский район': 'Ахты',
    'Бабаюртовский район': 'Бабаюрт',
    'Ботлихский район': 'Ботлих',
    'Буйнакский район': 'Буйнакск',
    'Гергебильский район': 'Гергебиль',
    'Гумбетовский район': 'Мехельта',
    'Гунибский район': 'Гуниб',
    'Дахадаевский район': 'Уркарах',
    'Дербентский район': 'Дербент',
    'Докузпаринский район': 'Усухчай',
    'Казбековский район': 'Дылым',
    'Кайтагский район': 'Маджалис',
    'Карабудахкентский район': 'Карабудахкент',
    'Каякентский район': 'Новокаякент',
    'Кизилюртовский район': 'Кизилюрт',
    'Кизлярский район': 'Кизляр',
    'Кулинский район': 'Вачи',
    'Кумторкалинский район': 'Коркмаскала',
    'Курахский район': 'Курах',
    'Лакский район': 'Кумух',
    'Левашинский район': 'Леваши',
    'Магарамкентский район': 'Магарамкент',
    'Новолакский район': 'Новолакское',
    'Ногайский район': 'Терекли-Мектеб',
    'Рутульский район': 'Рутул',
    'Сергокалинский район': 'Сергокала',
    'Сулейман-Стальский район': 'Касумкент',
    'Табасаранский район': 'Хучни',
    'Тарумовский район': 'Тарумовка',
    'Тляратинский район': 'Тлярата',
    'Унцукульский район': 'Унцукуль',
    'Хасавюртовский район': 'Хасавюрт',
    'Хивский район': 'Хив',
    'Хунзахский район': 'Хунзах',
    'Цумадинский район': 'Агвали',
    'Цунтинский район': 'Кидеро',
    'Чародинский район': 'Цуриб',
    'Шамильский район': 'Хебда',
    'Бежтинский участок': 'Бежта'
  };
  const centerCoordinatesCache = new Map();
  let centerMarker = null;

  function normalizeDistrictName(value) {
    return String(value || '').toLocaleLowerCase('ru')
      .replace(/ё/g, 'е')
      .replace(/^муниципальное образование\s+/i, '')
      .replace(/\s*\\((?:муниципальный район|район)\\)$/i, '')
      .replace(/\s+(?:муниципальный район|муниципального района|район)$/i, '')
      .trim();
  }

  async function locateAdministrativeCenter(centerName) {
    if (centerCoordinatesCache.has(centerName)) return centerCoordinatesCache.get(centerName);
    const query = encodeURIComponent(centerName + ', Республика Дагестан, Россия');
    const response = await fetch('https://photon.komoot.io/api/?q=' + query + '&limit=8&lang=ru');
    if (!response.ok) throw new Error('Не удалось найти координаты центра (HTTP ' + response.status + ')');
    const data = await response.json();
    const candidates = (data.features || []).filter(feature => {
      const coordinates = feature.geometry && feature.geometry.coordinates;
      return Array.isArray(coordinates) && coordinates.length >= 2 &&
        Number.isFinite(coordinates[0]) && Number.isFinite(coordinates[1]) &&
        coordinates[1] >= 40.9 && coordinates[1] <= 44.9 &&
        coordinates[0] >= 45.0 && coordinates[0] <= 49.2;
    });
    if (!candidates.length) throw new Error('Координаты населённого пункта «' + centerName + '» не найдены');
    const exact = candidates.find(feature => {
      const props = feature.properties || {};
      return normalizeDistrictName(props.name) === normalizeDistrictName(centerName);
    });
    const chosen = exact || candidates[0];
    const coords = chosen.geometry.coordinates;
    const result = { lat: coords[1], lon: coords[0] };
    centerCoordinatesCache.set(centerName, result);
    return result;
  }

  const styleBase = { color: '#64748b', weight: 1.35, opacity: .98, fillColor: '#dce8f2', fillOpacity: .58 };
  const regionOutlineStyle = { color: '#173b63', weight: 4, opacity: 1, fill: false, interactive: false };
  const highlightStyle = { color: '#c2410c', weight: 2.6, opacity: 1, fillColor: '#f97316', fillOpacity: .88 };

  function shuffle(items) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function beginQuestion() {
    if (districts.length < 4) {
      statusEl.textContent = 'Недостаточно данных';
      optionsEl.innerHTML = '<div class="loading-option">Не удалось получить четыре района. Попробуй обновить страницу позже.</div>';
      return;
    }
    gameOver = false;
    question++;
    answered = false;
    target = districts[Math.floor(Math.random() * districts.length)];
    layersByName.forEach((layer, name) => layer.setStyle(name === target.name ? highlightStyle : styleBase));
    const choices = shuffle([target, ...shuffle(districts.filter(d => d.name !== target.name)).slice(0, 3)]);
    questionNumber.textContent = 'ВОПРОС ' + String(question).padStart(2, '0');
    optionsEl.innerHTML = '';
    feedbackEl.textContent = '';
    feedbackEl.className = 'feedback';
    nextBtn.disabled = true;
    nextBtn.innerHTML = 'Следующий вопрос <span aria-hidden="true">→</span>';

    choices.forEach((district, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer-option';
      button.innerHTML = '<span class="option-letter">' + String.fromCharCode(65 + i) + '</span><span></span>';
      button.lastElementChild.textContent = district.name;
      button.addEventListener('click', () => choose(button, district));
      optionsEl.appendChild(button);
    });

    const layer = layersByName.get(target.name);
    if (layer && layer.getBounds && layer.getBounds().isValid()) {
      map.fitBounds(layer.getBounds(), { padding: [28, 28], maxZoom: 9, animate: true });
    }
  }

  function choose(button, district) {
    if (answered) return;
    answered = true;
    const correct = district.name === target.name;
    if (correct) {
      score++;
      button.classList.add('correct');
      feedbackEl.textContent = 'Верно! Это ' + target.name + '.';
      feedbackEl.className = 'feedback good';
    } else {
      mistakes++;
      if (mode === 'timed') { lives--; updateLives(); }
      button.classList.add('incorrect');
      [...optionsEl.children].forEach(b => {
        if (b.lastElementChild.textContent === target.name) b.classList.add('correct');
      });
      if (mode === 'training') {
        feedbackEl.textContent = 'Запомни: правильный ответ — ' + target.name + '. В обучении можно ошибаться без ограничений.';
        feedbackEl.className = 'feedback neutral';
      } else if (lives > 0) {
        feedbackEl.textContent = 'Не совсем. Правильный ответ: ' + target.name + '. Осталось жизней: ' + lives + '.';
        feedbackEl.className = 'feedback bad';
      } else { finishTimedGame('Жизни закончились!'); }
    }
    [...optionsEl.children].forEach(b => b.disabled = true);
    scoreLabel.textContent = 'Верных ответов: ' + score + ' из ' + question + (mode === 'training' ? ' · Ошибок: ' + mistakes : '');
    if (!gameOver) nextBtn.disabled = false;
  }

  nextBtn.addEventListener('click', () => { if (gameOver) { resetGame(); return; } beginQuestion(); });
  modeButtons.forEach(button => button.addEventListener('click', () => { if (button.dataset.mode !== mode) setMode(button.dataset.mode); }));

  async function loadDistricts() {
    try {
      statusEl.textContent = 'Загружаем границы…';

      // Use the Dagestan-specific municipal GeoJSON, not Russia-wide ADM2 data.
      // Keep a CDN mirror as fallback in case raw.githubusercontent.com is unavailable.
      let geojson = null;
      const sources = [
        async () => {
          const url = "https://raw.githubusercontent.com/timurkanaz/Russia_geojson_OSM/master/GeoJson%27s/Regions/SKFO/%D0%A0%D0%B5%D1%81%D0%BF%D1%83%D0%B1%D0%BB%D0%B8%D0%BA%D0%B0%20%D0%94%D0%B0%D0%B3%D0%B5%D1%81%D1%82%D0%B0%D0%BD_Dagestan%20Republic.geojson";
          const response = await fetch(url);
          if (!response.ok) throw new Error('OSM GeoJSON HTTP ' + response.status);
          return response.json();
        },
        async () => {
          const url = "https://cdn.jsdelivr.net/gh/timurkanaz/Russia_geojson_OSM@master/GeoJson%27s/Regions/SKFO/%D0%A0%D0%B5%D1%81%D0%BF%D1%83%D0%B1%D0%BB%D0%B8%D0%BA%D0%B0%20%D0%94%D0%B0%D0%B3%D0%B5%D1%81%D1%82%D0%B0%D0%BD_Dagestan%20Republic.geojson";
          const response = await fetch(url);
          if (!response.ok) throw new Error('GeoJSON CDN HTTP ' + response.status);
          return response.json();
        }
      ];

      let lastError;
      for (const getSource of sources) {
        try {
          const candidate = await getSource();
          if (candidate && Array.isArray(candidate.features) && candidate.features.length) {
            geojson = candidate;
            break;
          }
          throw new Error('В источнике нет массива features');
        } catch (error) {
          lastError = error;
          console.warn('Источник границ не сработал:', error);
        }
      }
      if (!geojson) throw lastError || new Error('Не удалось получить GeoJSON');

      const unique = new Map();
      geojson.features.forEach(feature => {
        if (!feature.geometry || !/Polygon|MultiPolygon/.test(feature.geometry.type)) return;
        const rawName = String(nameOf(feature) || '').trim();
        if (!rawName) return;

        const p = feature.properties || {};
        const adminLevel = String(p.admin_level || p.adminLevel || p.shapeType || '');
        if (/городской округ|сельское поселение|городское поселение|внутригородской район/i.test(rawName)) return;
        if (adminLevel && /^\d+$/.test(adminLevel) && !['4', '5', '6'].includes(adminLevel)) return;

        let name = rawName
          .replace(/^муниципальное образование\s+/i, '')
          .replace(/\s*\((?:муниципальный район|район)\)$/i, '')
          .replace(/\s+(?:муниципальный район|муниципального района|район)$/i, '')
          .trim();
        if (!name || /дагестан/i.test(name) || /republic|dagestan/i.test(name)) return;
        if (!unique.has(name)) unique.set(name, { name, feature });
      });

      districts = [...unique.values()];
      if (districts.length < 4) {
        throw new Error('После обработки найдено только ' + districts.length + ' районов');
      }

      const group = L.featureGroup();
      districts.forEach(district => {
        const layer = L.geoJSON(district.feature, {
          style: styleBase,
          interactive: true,
          onEachFeature: (feature, featureLayer) => {
            featureLayer.on('click', event => {
              if (mode !== 'training') return;
              const centerName = administrativeCenters[normalizeDistrictName(district.name)] ||
                administrativeCenters[district.name] ||
                Object.entries(administrativeCenters).find(([districtName]) =>
                  normalizeDistrictName(districtName) === normalizeDistrictName(district.name)
                )?.[1];
              const popupContent = document.createElement('div');
              const districtLine = document.createElement('div');
              districtLine.append('Район: ');
              const districtName = document.createElement('strong');
              districtName.textContent = district.name;
              districtLine.appendChild(districtName);
              popupContent.appendChild(districtLine);
              const centerLine = document.createElement('div');
              centerLine.style.marginTop = '4px';
              centerLine.append('Административный центр: ');
              const centerLabel = document.createElement('strong');
              centerLabel.textContent = centerName || 'не указан в справочнике';
              centerLine.appendChild(centerLabel);
              popupContent.appendChild(centerLine);
              const popup = L.popup({ closeButton: true, autoPan: true, className: 'district-name-popup' })
                .setLatLng(event.latlng)
                .setContent(popupContent)
                .openOn(map);

              if (centerMarker) map.removeLayer(centerMarker);
              if (centerName) {
                centerLabel.textContent = centerName + ' (ищем на карте…)';
                locateAdministrativeCenter(centerName).then(coords => {
                  if (!map.hasLayer(popup)) return;
                  centerMarker = L.marker([coords.lat, coords.lon], {
                    title: 'Административный центр: ' + centerName,
                    alt: 'Административный центр ' + centerName
                  }).addTo(map);
                  centerMarker.bindPopup('Административный центр: <strong>' +
                    centerName.replace(/[&<>"']/g, '') + '</strong>');
                  centerLabel.textContent = centerName;
                  map.panTo([coords.lat, coords.lon], { animate: true });
                }).catch(error => {
                  console.warn('Не удалось отметить административный центр:', error);
                  centerLabel.textContent = centerName + ' (координаты не найдены)';
                });
              }
            });
          }
        }).addTo(map);
        layersByName.set(district.name, layer);
        group.addLayer(layer);
      });
      map.fitBounds(group.getBounds(), { padding: [18, 18], maxZoom: 7 });

      // Load the federal-subject outline separately from district boundaries.
      try {
        const metaResponse = await fetch('https://www.geoboundaries.org/api/current/gbOpen/RUS/ADM1/');
        if (!metaResponse.ok) throw new Error('ADM1 metadata HTTP ' + metaResponse.status);
        let metadata = await metaResponse.json();
        if (Array.isArray(metadata)) metadata = metadata[0];
        const outlineUrl = metadata && (metadata.simplifiedGeometryGeoJSON || metadata.gjDownloadURL);
        if (!outlineUrl) throw new Error('ADM1 GeoJSON URL missing');
        const outlineResponse = await fetch(outlineUrl);
        if (!outlineResponse.ok) throw new Error('ADM1 GeoJSON HTTP ' + outlineResponse.status);
        const outlineData = await outlineResponse.json();
        const outlineFeature = (outlineData.features || []).find(feature =>
          /дагестан|dagestan/i.test(JSON.stringify(feature.properties || {}))
        );
        if (outlineFeature) {
          L.geoJSON(outlineFeature, { style: regionOutlineStyle, interactive: false }).addTo(map);
        } else {
          console.warn('Не найден контур Дагестана в ADM1 GeoJSON');
        }
      } catch (outlineError) {
        console.warn('Не удалось загрузить отдельный контур региона:', outlineError);
      }
      statusEl.textContent = districts.length + ' районов загружено';
      updateLives();
      beginQuestion();
    } catch (error) {
      console.error('Не удалось загрузить границы районов Дагестана:', error);
      statusEl.textContent = 'Ошибка загрузки';
      optionsEl.innerHTML = '<div class="loading-option">Не удалось загрузить геоданные. Причина: ' + String(error && error.message || 'неизвестная ошибка').replace(/[<>&\"']/g, '') + '</div>';
    }
  }
  updateLives();
  loadDistricts();
})();