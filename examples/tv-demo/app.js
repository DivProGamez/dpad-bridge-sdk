// Saffron Kitchen: an intentionally ordinary, mouse-first web app.
// Nothing in this file knows about DPadBridge, remotes or gamepads.
(function () {
  'use strict';

  var RECIPES = [
    { id: 'shakshuka', name: 'Shakshuka', mins: 25, tags: ['veg'], art: '🍳', hue: 14,
      desc: 'Eggs poached in a smoky tomato and pepper sauce. Serve with warm bread.' },
    { id: 'harira', name: 'Harira soup', mins: 45, tags: [], art: '🥣', hue: 32,
      desc: 'Lentils, chickpeas and tomato with herbs and a squeeze of lemon.' },
    { id: 'salad', name: 'Orange & olive salad', mins: 10, tags: ['quick', 'veg'], art: '🥗', hue: 96,
      desc: 'Sliced oranges, black olives, red onion, cumin and olive oil.' },
    { id: 'tagine', name: 'Chicken tagine', mins: 70, tags: [], art: '🍲', hue: 40,
      desc: 'Slow-cooked chicken with preserved lemon, olives and saffron.' },
    { id: 'msemen', name: 'Msemen flatbread', mins: 35, tags: ['veg'], art: '🫓', hue: 46,
      desc: 'Flaky, square griddle bread, great with honey or cheese.' },
    { id: 'chebakia', name: 'Sesame cookies', mins: 15, tags: ['quick', 'sweet', 'veg'], art: '🍪', hue: 28,
      desc: 'Crisp sesame cookies glazed with honey and orange blossom.' },
  ];

  var LIST = ['Eggs', 'Tomatoes', 'Red peppers', 'Garlic', 'Cumin', 'Paprika', 'Lentils', 'Chickpeas',
    'Celery', 'Coriander', 'Parsley', 'Lemons', 'Oranges', 'Black olives', 'Red onion', 'Olive oil',
    'Chicken thighs', 'Preserved lemon', 'Saffron', 'Ginger', 'Semolina', 'Flour', 'Butter', 'Honey',
    'Sesame seeds', 'Orange blossom water', 'Cinnamon', 'Almonds', 'Mint tea', 'Sugar'];

  var grid = document.getElementById('grid');
  var list = document.getElementById('list');
  var dialog = document.getElementById('recipe-dialog');
  var startCount = 0;
  var favorites = {};
  var openRecipe = null;

  // --- recipe cards: <div>s with click handlers, the classic mouse-first pattern
  RECIPES.forEach(function (r) {
    var card = document.createElement('div');
    card.className = 'card';
    card.id = 'card-' + r.id;
    card.setAttribute('data-dpad-focusable', ''); // inert unless DPadBridge is mounted
    card.setAttribute('data-tags', r.tags.join(' '));
    card.style.setProperty('--hue', r.hue);
    card.innerHTML =
      '<div class="card-art" aria-hidden="true">' + r.art + '</div>' +
      '<div class="card-text"><div class="card-title">' + r.name + '</div>' +
      '<div class="card-meta">' + r.mins + ' min' + (r.tags.indexOf('veg') >= 0 ? ' · vegetarian' : '') + '</div></div>';
    card.addEventListener('click', function () { showRecipe(r); });
    grid.appendChild(card);
  });

  // --- long shopping list in its own scroll container
  LIST.forEach(function (item, i) {
    var li = document.createElement('li');
    li.innerHTML = '<label><input type="checkbox" id="item-' + i + '"> <span>' + item + '</span></label>';
    list.appendChild(li);
  });
  list.addEventListener('change', updateCount);
  updateCount();

  function updateCount() {
    var done = list.querySelectorAll('input:checked').length;
    document.getElementById('list-count').textContent = done + ' / ' + LIST.length;
  }

  // --- menu links switch the section title
  Array.prototype.forEach.call(document.querySelectorAll('.menu-link'), function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      document.querySelectorAll('.menu-link').forEach(function (l) { l.classList.remove('is-current'); });
      link.classList.add('is-current');
      document.getElementById('section-name').textContent = link.getAttribute('data-section');
    });
  });

  // --- filter chips hide/show cards (a real DOM change)
  Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('is-on'); });
      chip.classList.add('is-on');
      var f = chip.getAttribute('data-filter');
      Array.prototype.forEach.call(grid.children, function (card) {
        card.hidden = f !== 'all' && card.getAttribute('data-tags').split(' ').indexOf(f) < 0;
      });
    });
  });

  // --- search filters by name as you type
  document.getElementById('search').addEventListener('input', function (e) {
    var q = e.target.value.trim().toLowerCase();
    Array.prototype.forEach.call(grid.children, function (card) {
      card.hidden = q !== '' && card.textContent.toLowerCase().indexOf(q) < 0;
    });
  });

  // --- recipe dialog
  function showRecipe(r) {
    openRecipe = r;
    document.getElementById('dialog-title').textContent = r.name;
    document.getElementById('dialog-meta').textContent = r.mins + ' minutes';
    document.getElementById('dialog-desc').textContent = r.desc;
    document.getElementById('dialog-art').textContent = r.art;
    dialog.style.setProperty('--hue', r.hue);
    syncFav();
    dialog.showModal();
  }

  function syncFav() {
    var on = !!favorites[openRecipe.id];
    var fav = document.getElementById('fav-button');
    fav.setAttribute('aria-pressed', String(on));
    fav.textContent = on ? '♥ In favorites' : '♡ Add to favorites';
  }

  document.getElementById('start-cooking').addEventListener('click', function () {
    startCount += 1;
    document.getElementById('start-count').textContent = String(startCount);
  });
  document.getElementById('fav-button').addEventListener('click', function () {
    favorites[openRecipe.id] = !favorites[openRecipe.id];
    syncFav();
  });
  document.getElementById('close-dialog').addEventListener('click', function () { dialog.close(); });
  // Mouse users can also click the backdrop to close.
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
})();
