(() => {
  const map = L.map('dagestan-map', { zoomControl: true, scrollWheelZoom: false }).setView([42.45, 47.2], 7);
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
    return p.name || p['name:ru'] || p['name:en'] || p['official_name'] || p['official_name:ru'] || '';
  };
  const styleBase = { color: '#91a0b5', weight: 1.1, opacity: .95, fillColor: '#dce8f2', fillOpacity: .58 };
  const highlightStyle = { color: '#c2410c', weight: 2.6, opacity: 1, fillColor: '#f97316', fillOpacity: .88 };
  function shuffle(items) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function beginQuestion() {
    if (districts.length < 4) {
      statusEl.textContent = 'Недостаточно данных';
      optionsEl.innerHTML = '<div class="loading-option">Не удалось получить четыре района. Попробуй обновить страницу позже.</div>';
      return;
    }
    question++; answered = false;
    target = districts[Math.floor(Math.random() * districts.length)];
    layersByName.forEach((layer, name) => layer.setStyle(name === target.name ? highlightStyle : styleBase));
    const choices = shuffle([target, ...shuffle(districts.filter(d => d.name !== target.name)).slice(0, 3)]);
    questionNumber.textContent = 'ВОПРОС ' + String(question).padStart(2, '0');
    optionsEl.innerHTML = '';
    feedbackEl.textContent = ''; feedbackEl.className = 'feedback';
    nextBtn.disabled = true;
    choices.forEach((district, i) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'answer-option';
      button.innerHTML = '<span class="option-letter">' + String.fromCharCode(65 + i) + '</span><span></span>';
      button.lastElementChild.textContent = district.name;
      button.addEventListener('click', () => choose(button, district));
      optionsEl.appendChild(button);
    });
    const layer = layersByName.get(target.name);
    if (layer && layer.getBounds && layer.getBounds().isValid()) map.fitBounds(layer.getBounds(), { padding: [28, 28], maxZoom: 9, animate: true });
  }
  function choose(button, district) {
    if (answered) return;
    answered = true;
    const correct = district.name === target.name;
    if (correct) { score++; button.classList.add('correct'); feedbackEl.textContent = 'Верно! Это ' + target.name + ' район.'; feedbackEl.className = 'feedback good'; }
    else {
      button.classList.add('incorrect');
      [...optionsEl.children].forEach(b => { if (b.lastElementChild.textContent === target.name) b.classList.add('correct'); });
      feedbackEl.textContent = 'Не совсем. Правильный ответ: ' + target.name + ' район.'; feedbackEl.className = 'feedback bad';
    }
    [...optionsEl.children].forEach(b => b.disabled = true);
    scoreLabel.textContent = 'Верных ответов: ' + score + ' из ' + question;
    nextBtn.disabled = false;
  }
  nextBtn.addEventListener('click', beginQuestion);

  async function loadDistricts() {
    try {
      statusEl.textContent = 'Получаем границы…';
      const query = '[out:json][timeout:35];area["name"="Республика Дагестан"]["boundary"="administrative"]->.dagestan;(relation["boundary"="administrative"]["admin_level"~"6|7"](area.dagestan););out body;>;out skel qt;';
      const response = await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query));
      if (!response.ok) throw new Error('Overpass HTTP ' + response.status);
      const osm = await response.json();
      const geojson = osmtogeojson(osm);
      const features = geojson.features.filter(f => f.geometry && /Polygon|MultiPolygon/.test(f.geometry.type) && nameOf(f));
      const unique = new Map();
      features.forEach(f => {
        const name = nameOf(f).replace(/\s+(муниципальный|муниципального) район$/i, '').trim();
        if (!name || /дагестан/i.test(name) || /городской округ/i.test(name)) return;
        if (!unique.has(name)) unique.set(name, { name, feature: f });
      });
      districts = [...unique.values()];
      if (districts.length < 4) throw new Error('Недостаточно районов в ответе');
      const group = L.featureGroup();
      districts.forEach(d => {
        const layer = L.geoJSON(d.feature, { style: styleBase, interactive: false }).addTo(map);
        layersByName.set(d.name, layer); group.addLayer(layer);
      });
      map.fitBounds(group.getBounds(), { padding: [18, 18] });
      statusEl.textContent = districts.length + ' территорий загружено';
      beginQuestion();
    } catch (error) {
      console.error('Не удалось загрузить границы районов Дагестана:', error);
      statusEl.textContent = 'Ошибка загрузки';
      optionsEl.innerHTML = '<div class="loading-option">Не удалось загрузить границы районов из открытого источника. Проверь подключение и обнови страницу.</div>';
    }
  }
  loadDistricts();
})();