(() => {
  const map = L.map('dagestan-map', { zoomControl: true, scrollWheelZoom: false, attributionControl: false }).setView([42.45, 47.2], 7);
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
  const styleBase = { color: '#91a0b5', weight: 1.1, opacity: .95, fillColor: '#dce8f2', fillOpacity: .58 };
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

      // Try the simplified geoBoundaries dataset first; use the OSM GeoJSON as fallback.
      let geojson = null;
      const sources = [
        async () => {
          const metaResponse = await fetch('https://www.geoboundaries.org/api/current/gbOpen/RUS/ADM2/');
          if (!metaResponse.ok) throw new Error('geoBoundaries API HTTP ' + metaResponse.status);
          let metadata = await metaResponse.json();
          if (Array.isArray(metadata)) metadata = metadata[0];
          const geometryUrl = metadata && (metadata.simplifiedGeometryGeoJSON || metadata.gjDownloadURL);
          if (!geometryUrl) throw new Error('geoBoundaries не вернул ссылку на GeoJSON');
          const geometryResponse = await fetch(geometryUrl);
          if (!geometryResponse.ok) throw new Error('geoBoundaries GeoJSON HTTP ' + geometryResponse.status);
          return geometryResponse.json();
        },
        async () => {
          const url = "https://raw.githubusercontent.com/timurkanaz/Russia_geojson_OSM/master/GeoJson's/Regions/SKFO/Республика%20Дагестан_Dagestan%20Republic.geojson";
          const response = await fetch(url);
          if (!response.ok) throw new Error('OSM GeoJSON HTTP ' + response.status);
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
      map.fitBounds(group.getBounds(), { padding: [18, 18] });
      statusEl.textContent = districts.length + ' районов загружено';
      beginQuestion();
    } catch (error) {
      console.error('Не удалось загрузить границы районов Дагестана:', error);
      statusEl.textContent = 'Ошибка загрузки';
      optionsEl.innerHTML = '<div class="loading-option">Не удалось загрузить геоданные. Попробуй обновить страницу позже.</div>';
    }
  }
  loadDistricts();
})();