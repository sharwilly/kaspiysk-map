(() => {
  const dagestanBounds = L.latLngBounds([[40.9, 45.0], [44.9, 49.2]]);
  const map = L.map('dagestan-map', { zoomControl: true, scrollWheelZoom: false, attributionControl: false, maxBounds: dagestanBounds, maxBoundsViscosity: 1.0, minZoom: 6, maxZoom: 10 }).setView([42.45, 47.2], 7);\n  map.setMaxBounds(dagestanBounds);
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
  let districts = [], layersByName = new Map(), target = null, answered = false, question = 0, score = 0;

  const nameOf = f => {
    const p = f.properties || {};
    return p['name:ru'] || p.name || p['official_name:ru'] || p.official_name ||
      p.shapeName || p.NAME_2 || p.NAME_1 || p.NAME || p.name_ru ||
      p['name:en'] || p.NAME_EN || '';
  };
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
      button.classList.add('incorrect');
      [...optionsEl.children].forEach(b => {
        if (b.lastElementChild.textContent === target.name) b.classList.add('correct');
      });
      feedbackEl.textContent = 'Не совсем. Правильный ответ: ' + target.name + '.';
      feedbackEl.className = 'feedback bad';
    }
    [...optionsEl.children].forEach(b => b.disabled = true);
    scoreLabel.textContent = 'Верных ответов: ' + score + ' из ' + question;
    nextBtn.disabled = false;
  }

  nextBtn.addEventListener('click', beginQuestion);

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
        const layer = L.geoJSON(district.feature, { style: styleBase, interactive: false }).addTo(map);
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
      beginQuestion();
    } catch (error) {
      console.error('Не удалось загрузить границы районов Дагестана:', error);
      statusEl.textContent = 'Ошибка загрузки';
      optionsEl.innerHTML = '<div class="loading-option">Не удалось загрузить геоданные. Причина: ' + String(error && error.message || 'неизвестная ошибка').replace(/[<>&\"']/g, '') + '</div>';
    }
  }
  loadDistricts();
})();