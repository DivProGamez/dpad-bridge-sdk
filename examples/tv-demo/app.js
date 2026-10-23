// Saffron Kitchen: an intentionally ordinary, mouse-first web app.
// Nothing in this file knows about DPadBridge, remotes or gamepads.
(function () {
  'use strict';

  var PHOTOS = 'assets/photos/';
  var RECIPES = [
    { id: 'shakshuka', steps: ["Warm olive oil in a wide pan. Soften the sliced onion and red peppers for about 8 minutes.", "Stir in the garlic, cumin and paprika and cook for one minute until fragrant.", "Add the chopped tomatoes, season with salt and simmer until the sauce thickens.", "Make small wells in the sauce and crack an egg into each one.", "Cover and cook gently until the whites are set but the yolks are still soft. Serve with bread."], name: 'Shakshuka', mins: 25, yield: 'Serves 2', tags: ['veg'],
      photo: 'shakshuka.jpg', tall: 'shakshuka-tall.jpg',
      desc: 'Eggs gently poached in a smoky tomato and pepper sauce. Serve with warm bread.',
      ingredients: ['Eggs', 'Tomatoes', 'Red peppers', 'Onion', 'Garlic', 'Cumin', 'Paprika', 'Olive oil'] },
    { id: 'harira', steps: ["Soak the chickpeas overnight, or use cooked chickpeas.", "Soften the chopped onion and celery in a large pot.", "Add the lentils, chickpeas, tomatoes and plenty of water. Simmer for about 30 minutes.", "Stir in the chopped coriander and parsley and simmer a few minutes more.", "Taste, season, and serve with a squeeze of lemon."], name: 'Harira soup', mins: 45, yield: 'Serves 6', tags: ['veg'],
      photo: 'harira.jpg',
      desc: 'Lentils, chickpeas and tomato simmered with fresh herbs, finished with a squeeze of lemon.',
      ingredients: ['Lentils', 'Chickpeas', 'Tomatoes', 'Celery', 'Onion', 'Coriander', 'Parsley', 'Lemons'] },
    { id: 'salad', steps: ["Peel the oranges and slice them into rounds.", "Arrange the slices on a plate with thinly sliced red onion.", "Scatter over the black olives and torn mint leaves.", "Dust with cumin and drizzle with olive oil just before serving."], name: 'Orange & olive salad', mins: 10, yield: 'Serves 4', tags: ['quick', 'veg'],
      photo: 'salad.jpg',
      desc: 'Juicy oranges, black olives and crisp greens with cumin and a drizzle of olive oil.',
      ingredients: ['Oranges', 'Black olives', 'Red onion', 'Mint', 'Cumin', 'Olive oil'] },
    { id: 'tagine', steps: ["Rub the chicken thighs with ginger, saffron and a little salt.", "Brown the chicken with onion and garlic in the base of the tagine.", "Add a splash of water, cover and cook gently for about 45 minutes.", "Add the preserved lemon and green olives and cook 10 minutes more.", "Spoon the sauce over the chicken and serve hot."], name: 'Chicken tagine', mins: 70, yield: 'Serves 4', tags: [],
      photo: 'tagine.jpg', tall: 'tagine.jpg',
      desc: 'Slow-cooked chicken with preserved lemon, green olives and saffron.',
      ingredients: ['Chicken thighs', 'Preserved lemon', 'Green olives', 'Saffron', 'Ginger', 'Onion', 'Garlic'] },
    { id: 'msemen', steps: ["Mix the flour, semolina and salt with warm water into a soft, smooth dough.", "Rest the dough, then divide it into small balls and oil them.", "Stretch each ball very thin, brush with butter, and fold it into a square.", "Cook the squares on a hot griddle until golden on both sides.", "Serve warm with honey."], name: 'Msemen flatbread', mins: 35, yield: 'Makes 8', tags: ['veg'],
      photo: 'msemen.jpg', tall: 'msemen.jpg',
      desc: 'Flaky, square griddle bread, great with honey or cheese.',
      ingredients: ['Flour', 'Semolina', 'Butter', 'Olive oil', 'Salt', 'Honey'] },
    { id: 'chebakia', steps: ["Mix the flour, ground almonds, sesame seeds and melted butter into a dough.", "Roll it out and cut it into small rounds.", "Bake until golden.", "Warm the honey with orange blossom water and glaze the warm cookies.", "Sprinkle with more sesame seeds and let them set."], name: 'Sesame cookies', mins: 15, yield: 'Makes 12', tags: ['quick', 'sweet', 'veg'],
      photo: 'cookies.jpg',
      desc: 'Crisp sesame cookies glazed with honey and orange blossom.',
      ingredients: ['Sesame seeds', 'Flour', 'Butter', 'Honey', 'Orange blossom water', 'Almonds'] },
  ];

  var LIST = ['Eggs', 'Tomatoes', 'Red peppers', 'Garlic', 'Cumin', 'Paprika', 'Lentils', 'Chickpeas',
    'Celery', 'Coriander', 'Parsley', 'Lemons', 'Oranges', 'Black olives', 'Red onion', 'Olive oil',
    'Chicken thighs', 'Preserved lemon', 'Saffron', 'Ginger', 'Semolina', 'Flour', 'Butter', 'Honey',
    'Sesame seeds', 'Orange blossom water', 'Cinnamon', 'Almonds', 'Mint tea', 'Sugar'];

  var grid = document.getElementById('grid');
  var list = document.getElementById('list');
  var dialog = document.getElementById('recipe-dialog');
  var emptyEl = document.getElementById('empty');
  var state = { view: 'all', filter: 'all', query: '' };
  var favorites = {};
  var startCount = 0;
  var addedCount = 0;
  var openRecipe = null;

  function icon(name) {
    return '<svg class="ic" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  // --- recipe cards: <div>s with click handlers, the classic mouse-first pattern
  RECIPES.forEach(function (r) {
    var card = document.createElement('div');
    card.className = 'card';
    card.id = 'card-' + r.id;
    card.setAttribute('data-dpad-focusable', ''); // inert unless DPadBridge is mounted
    card.setAttribute('data-tags', r.tags.join(' '));
    card.innerHTML =
      '<img class="card-photo" src="' + PHOTOS + r.photo + '" alt="">' +
      '<span class="fav-badge" title="In favorites">' + icon('heart-fill') + '</span>' +
      '<div class="card-text"><div class="card-title">' + r.name + '</div>' +
      '<div class="card-meta"><span>' + icon('clock') + r.mins + ' min</span>' +
      (r.tags.indexOf('veg') >= 0 ? '<span>' + icon('leaf') + 'Vegetarian</span>' : '<span>' + icon('users') + r.yield + '</span>') +
      '</div></div>';
    card.addEventListener('click', function () { showRecipe(r); });
    grid.appendChild(card);
  });

  // --- long shopping list in its own scroll container
  LIST.forEach(function (item, i) { list.appendChild(listItem('item-' + i, item, false)); });
  list.addEventListener('change', updateCount);
  updateCount();

  function listItem(id, name, isNew) {
    var li = document.createElement('li');
    if (isNew) li.className = 'is-new';
    li.innerHTML = '<label><input type="checkbox" id="' + id + '"> <span class="name">' + name + '</span>' +
      (isNew ? '<span class="new-tag">Added</span>' : '') + '</label>';
    return li;
  }

  function updateCount() {
    var total = list.querySelectorAll('input').length;
    var done = list.querySelectorAll('input:checked').length;
    document.getElementById('list-count').textContent = done + ' / ' + total;
  }

  function findItem(name) {
    var spans = list.querySelectorAll('.name');
    for (var i = 0; i < spans.length; i++) {
      if (spans[i].textContent.toLowerCase() === name.toLowerCase()) return spans[i].parentNode.querySelector('input');
    }
    return null;
  }

  // --- filtering: menu view + chip + search, all real
  function applyFilters() {
    var visible = 0;
    RECIPES.forEach(function (r) {
      var card = document.getElementById('card-' + r.id);
      var show = (state.view !== 'favorites' || favorites[r.id]) &&
        (state.filter === 'all' || r.tags.indexOf(state.filter) >= 0) &&
        (state.query === '' || r.name.toLowerCase().indexOf(state.query) >= 0);
      card.hidden = !show;
      card.classList.toggle('is-fav', !!favorites[r.id]);
      if (show) visible += 1;
    });
    emptyEl.hidden = visible > 0;
    emptyEl.textContent = state.view === 'favorites' && !Object.keys(favorites).some(function (k) { return favorites[k]; })
      ? 'No favorites yet. Open a recipe and press the heart.'
      : 'No recipes match this filter.';
    document.getElementById('section-name').textContent = state.view === 'favorites' ? 'Your favorites' : 'Tonight’s picks';
  }

  Array.prototype.forEach.call(document.querySelectorAll('.menu-link'), function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var view = link.getAttribute('data-view');
      if (view === 'list') {
        // Jump to the first item still to buy.
        var next = list.querySelector('input:not(:checked)') || list.querySelector('input');
        if (next) next.focus();
        return;
      }
      document.querySelectorAll('.menu-link').forEach(function (l) { l.classList.remove('is-current'); });
      link.classList.add('is-current');
      state.view = view;
      applyFilters();
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-on'); });
      chip.classList.add('is-on');
      state.filter = chip.getAttribute('data-filter');
      applyFilters();
    });
  });

  document.getElementById('search').addEventListener('input', function (e) {
    state.query = e.target.value.trim().toLowerCase();
    applyFilters();
  });

  // --- recipe dialog
  function showRecipe(r) {
    openRecipe = r;
    var art = document.getElementById('dialog-art');
    var src = PHOTOS + (r.tall || r.photo);
    document.getElementById('dialog-photo').src = src;
    art.style.backgroundImage = 'url("' + src + '")';
    art.classList.toggle('is-wide', !r.tall);
    document.getElementById('dialog-title').textContent = r.name;
    document.getElementById('dialog-meta').innerHTML =
      '<span>' + icon('clock') + r.mins + ' minutes</span>' +
      (r.tags.indexOf('veg') >= 0 ? '<span>' + icon('leaf') + 'Vegetarian</span>' : '') +
      '<span>' + icon('users') + r.yield + '</span>';
    document.getElementById('dialog-desc').textContent = r.desc;
    document.getElementById('dialog-ingredients').innerHTML = r.ingredients.map(function (i) { return '<li>' + i + '</li>'; }).join('');
    document.querySelector('#add-to-list span').textContent = 'Add to shopping list';
    document.getElementById('list-feedback').textContent = '';
    syncFav();
    exitCooking(false);
    dialog.showModal();
  }

  // --- guided cooking inside the dialog (real steps, no fake timers)
  var cook = { active: false, step: 0, done: false };
  var cookPanel = document.getElementById('cook-panel');
  var info = document.getElementById('recipe-info');

  function startCooking() {
    cook = { active: true, step: 0, done: false };
    info.hidden = true;
    cookPanel.hidden = false;
    renderCooking();
    document.getElementById('cook-next').focus();
  }

  function exitCooking(restoreFocus) {
    cook.active = false;
    cookPanel.hidden = true;
    info.hidden = false;
    if (restoreFocus) document.getElementById('start-cooking').focus();
  }

  function renderCooking() {
    var steps = openRecipe.steps;
    var total = steps.length;
    var prev = document.getElementById('cook-prev');
    var next = document.getElementById('cook-next');
    var finish = document.getElementById('cook-finish');
    var exit = document.querySelector('#cook-exit span');
    document.getElementById('cook-label').textContent = 'Cooking · ' + openRecipe.name;
    if (cook.done) {
      document.getElementById('cook-progress-text').textContent = 'All ' + total + ' steps done';
      document.getElementById('cook-step').textContent = 'Finished! Enjoy your ' + openRecipe.name.toLowerCase() + '.';
      setProgress(100);
      prev.hidden = next.hidden = finish.hidden = true;
      exit.textContent = 'Back to recipe';
      return;
    }
    document.getElementById('cook-progress-text').textContent = 'Step ' + (cook.step + 1) + ' of ' + total;
    document.getElementById('cook-step').textContent = steps[cook.step];
    setProgress(((cook.step + 1) / total) * 100);
    prev.hidden = false;
    prev.disabled = cook.step === 0;
    var last = cook.step === total - 1;
    next.hidden = last;
    finish.hidden = !last;
    exit.textContent = 'Exit cooking';
  }

  function setProgress(pct) {
    document.getElementById('cook-bar-fill').style.width = pct + '%';
    document.getElementById('cook-bar').setAttribute('aria-valuenow', String(Math.round(pct)));
  }

  // Keep keyboard/remote focus on a visible, enabled control after a step change.
  function keepFocus(preferred) {
    var a = document.activeElement;
    if (a && cookPanel.contains(a) && !a.hidden && !a.disabled) return;
    for (var i = 0; i < preferred.length; i++) {
      var el = document.getElementById(preferred[i]);
      if (!el.hidden && !el.disabled) { el.focus(); return; }
    }
  }

  document.getElementById('cook-next').addEventListener('click', function () {
    cook.step = Math.min(cook.step + 1, openRecipe.steps.length - 1);
    renderCooking();
    keepFocus(['cook-next', 'cook-finish']);
  });
  document.getElementById('cook-prev').addEventListener('click', function () {
    cook.step = Math.max(cook.step - 1, 0);
    renderCooking();
    keepFocus(['cook-prev', 'cook-next']);
  });
  document.getElementById('cook-finish').addEventListener('click', function () {
    cook.done = true;
    renderCooking();
    keepFocus(['cook-exit']);
  });
  document.getElementById('cook-exit').addEventListener('click', function () { exitCooking(true); });
  dialog.addEventListener('close', function () { exitCooking(false); });

  function syncFav() {
    var on = !!favorites[openRecipe.id];
    var fav = document.getElementById('fav-button');
    fav.setAttribute('aria-pressed', String(on));
    fav.setAttribute('aria-label', on ? 'Remove from favorites' : 'Add to favorites');
    fav.title = fav.getAttribute('aria-label');
  }

  document.getElementById('start-cooking').addEventListener('click', function () {
    startCount += 1;
    document.getElementById('start-count').textContent = String(startCount);
    startCooking();
  });

  document.getElementById('fav-button').addEventListener('click', function () {
    favorites[openRecipe.id] = !favorites[openRecipe.id];
    syncFav();
    applyFilters();
  });

  // Adds missing ingredients to the top of the list and un-ticks ones already bought.
  document.getElementById('add-to-list').addEventListener('click', function () {
    var added = 0;
    var restored = 0;
    openRecipe.ingredients.slice().reverse().forEach(function (name) {
      var input = findItem(name);
      if (!input) {
        addedCount += 1;
        list.insertBefore(listItem('item-add-' + addedCount, name, true), list.firstChild);
        added += 1;
      } else if (input.checked) {
        input.checked = false;
        restored += 1;
      }
    });
    updateCount();
    var parts = [];
    if (added) parts.push('Added ' + added + ' new item' + (added > 1 ? 's' : ''));
    if (restored) parts.push(restored + ' marked to buy again');
    document.getElementById('list-feedback').textContent = parts.length
      ? parts.join(' · ')
      : 'All ' + openRecipe.ingredients.length + ' ingredients are already on your list';
    document.querySelector('#add-to-list span').textContent = 'On your list';
  });

  document.getElementById('close-dialog').addEventListener('click', function () { dialog.close(); });
  // Mouse users can also click the backdrop to close.
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

  applyFilters();
})();
