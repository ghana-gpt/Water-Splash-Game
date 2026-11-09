(() => {
  'use strict';

  const shell = document.getElementById('game-shell');
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const elements = {
    menu: document.getElementById('menu-overlay'),
    pause: document.getElementById('pause-overlay'),
    gameOver: document.getElementById('game-over-overlay'),
    leaderboard: document.getElementById('leaderboard-overlay'),
    menuTitle: document.getElementById('menu-title'),
    menuMessage: document.getElementById('menu-message'),
    start: document.getElementById('start-button'),
    resume: document.getElementById('resume-button'),
    pauseButton: document.getElementById('pause-button'),
    pauseRestart: document.getElementById('pause-restart-button'),
    sound: document.getElementById('sound-button'),
    menuScores: document.getElementById('menu-scores-button'),
    gameOverScores: document.getElementById('game-over-scores-button'),
    playAgain: document.getElementById('play-again-button'),
    leaderboardBack: document.getElementById('leaderboard-back-button'),
    score: document.getElementById('score-label'),
    level: document.getElementById('level-label'),
    best: document.getElementById('best-label'),
    finalScore: document.getElementById('final-score'),
    finalBest: document.getElementById('final-best'),
    scoreForm: document.getElementById('score-form'),
    playerName: document.getElementById('player-name'),
    saveStatus: document.getElementById('save-status'),
    leaderboardList: document.getElementById('leaderboard-list'),
    leaderboardEmpty: document.getElementById('empty-leaderboard')
  };

  const LEADERBOARD_KEY = 'water-splash-leaderboard-v1';
  const MAX_SCORES = 10;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let state = 'menu';
  let leaderboardReturnState = 'menu';
  let score = 0;
  let bestScore = 0;
  let level = 1;
  let spawnTimer = 0.6;
  let lastFrameTime = 0;
  let worldTime = 0;
  let soundEnabled = true;
  let audioContext = null;
  let scoreSavedThisRun = false;

  const keysDown = new Set();
  const obstacles = [];
  const particles = [];
  const floatingTexts = [];
  const player = {
    x: 0,
    y: 0,
    radius: 16,
    speed: 370,
    targetX: null
  };

  const waves = Array.from({ length: 5 }, (_, index) => ({
    y: 0.18 + index * 0.17,
    amplitude: 5 + index * 2,
    speed: (0.4 + index * 0.11) * (reducedMotion ? 0.25 : 1),
    phase: index * 1.6,
    alpha: 0.07 + index * 0.018
  }));

  function loadScores() {
    try {
      const value = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
      return Array.isArray(value)
        ? value.filter((entry) =>
            entry &&
            typeof entry.name === 'string' &&
            Number.isFinite(entry.score) &&
            entry.score >= 0
          ).slice(0, MAX_SCORES)
        : [];
    } catch {
      return [];
    }
  }

  let savedScores = loadScores();

  function persistScores() {
    try {
      localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(savedScores));
      return true;
    } catch {
      return false;
    }
  }

  function updateBestScore() {
    bestScore = savedScores.reduce((highest, entry) => Math.max(highest, entry.score), 0);
    elements.best.textContent = `Best: ${bestScore}`;
  }

  function updateHud() {
    elements.score.textContent = `Score: ${score}`;
    elements.level.textContent = `Level: ${level}`;
    updateBestScore();
  }

  function setSoundButton() {
    elements.sound.textContent = soundEnabled ? 'Sound on' : 'Sound off';
    elements.sound.setAttribute('aria-pressed', String(soundEnabled));
    elements.sound.setAttribute(
      'aria-label',
      soundEnabled ? 'Turn sound off' : 'Turn sound on'
    );
  }

  function playTone(frequency, duration = 0.12, type = 'sine', volume = 0.04) {
    if (!soundEnabled) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      audioContext ||= new AudioContextClass();
      if (audioContext.state === 'suspended') audioContext.resume();

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch {
      // Audio is optional; the game remains playable if unavailable.
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function resizeCanvas() {
    const rect = shell.getBoundingClientRect();
    const previousWidth = width;
    const previousHeight = height;

    width = rect.width;
    height = rect.height;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    if (!previousWidth || !previousHeight) {
      player.x = width / 2;
      player.y = height - 60;
      return;
    }

    const scaleX = width / previousWidth;
    const scaleY = height / previousHeight;
    player.x = clamp(player.x * scaleX, player.radius, width - player.radius);
    player.y = height - 60;

    for (const obstacle of obstacles) {
      obstacle.x *= scaleX;
      obstacle.y *= scaleY;
      obstacle.width *= scaleX;
    }
  }

  function showOnly(overlayName) {
    elements.menu.hidden = overlayName !== 'menu';
    elements.pause.hidden = overlayName !== 'pause';
    elements.gameOver.hidden = overlayName !== 'gameOver';
    elements.leaderboard.hidden = overlayName !== 'leaderboard';
  }

  function startGame() {
    score = 0;
    level = 1;
    spawnTimer = 0.45;
    scoreSavedThisRun = false;
    obstacles.length = 0;
    particles.length = 0;
    floatingTexts.length = 0;
    keysDown.clear();

    player.x = width / 2;
    player.y = height - 60;
    player.targetX = null;

    elements.menuTitle.textContent = 'Water Splash';
    elements.menuMessage.textContent =
      'Dodge the floating logs, make a splash, and see how long you can stay afloat.';
    elements.start.textContent = 'Start game';
    elements.saveStatus.textContent = '';
    elements.pauseButton.hidden = false;
    elements.pauseButton.textContent = 'Pause';

    state = 'playing';
    showOnly(null);
    updateHud();
    lastFrameTime = 0;
    playTone(520, 0.16, 'sine', 0.035);
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    keysDown.clear();
    showOnly('pause');
    elements.pauseButton.textContent = 'Resume';
    lastFrameTime = 0;
    playTone(330, 0.09, 'sine', 0.025);
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    showOnly(null);
    elements.pauseButton.textContent = 'Pause';
    lastFrameTime = 0;
    playTone(440, 0.09, 'sine', 0.025);
  }

  function finishGame() {
    if (state !== 'playing') return;

    state = 'gameover';
    keysDown.clear();
    elements.pauseButton.hidden = true;
    elements.finalScore.textContent = `Score: ${score} · Level reached: ${level}`;
    elements.finalBest.textContent = `Browser best: ${bestScore}`;
    elements.saveStatus.textContent = '';
    elements.playerName.disabled = false;
    elements.scoreForm.querySelector('button[type="submit"]').disabled = false;
    showOnly('gameOver');
    playTone(170, 0.34, 'triangle', 0.055);
  }

  function createObstacle() {
    const obstacleWidth = 48 + Math.random() * Math.min(78, width * 0.17);
    const obstacleHeight = 19 + Math.random() * 8;

    obstacles.push({
      x: Math.random() * Math.max(1, width - obstacleWidth),
      y: -obstacleHeight - 4,
      width: obstacleWidth,
      height: obstacleHeight,
      speed: Math.min(500, 155 + (level - 1) * 24 + Math.random() * 28),
      hue: 23 + Math.random() * 22,
      passed: false
    });
  }

  function addSplash(x, y, color = '#f3ffff', amount = 17, force = 150) {
    particles.push({
      kind: 'ring',
      x,
      y,
      radius: 3,
      maxRadius: 28 + Math.random() * 15,
      life: 0.48,
      maxLife: 0.48,
      color
    });

    for (let index = 0; index < amount; index++) {
      const angle = -Math.PI + Math.random() * Math.PI;
      const speed = force * (0.35 + Math.random() * 0.75);
      particles.push({
        kind: 'drop',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 35,
        radius: 2 + Math.random() * 3.5,
        life: 0.45 + Math.random() * 0.4,
        maxLife: 0.85,
        color
      });
    }
  }

  function addFloatingText(x, y, text) {
    floatingTexts.push({ x, y, text, life: 0.9, maxLife: 0.9 });
  }

  function awardPoints(points, x, y, label) {
    const previousLevel = level;
    score += points;
    level = Math.floor(score / 10) + 1;
    updateHud();

    if (label) addFloatingText(x, y, label);
    if (level > previousLevel) {
      addFloatingText(width / 2, height * 0.3, `LEVEL ${level}!`);
      playTone(740, 0.18, 'triangle', 0.035);
    }
  }

  function horizontalGapToPlayer(obstacle) {
    if (player.x < obstacle.x) return obstacle.x - player.x;
    if (player.x > obstacle.x + obstacle.width) {
      return player.x - (obstacle.x + obstacle.width);
    }
    return 0;
  }

  function update(dt) {
    worldTime += dt;

    if (state === 'paused') return;

    if (state === 'playing') {
      let direction = 0;
      if (keysDown.has('ArrowLeft') || keysDown.has('a') || keysDown.has('A')) direction -= 1;
      if (keysDown.has('ArrowRight') || keysDown.has('d') || keysDown.has('D')) direction += 1;

      if (direction !== 0) {
        player.x += direction * player.speed * dt;
        player.targetX = null;
      } else if (player.targetX !== null) {
        const difference = player.targetX - player.x;
        player.x += clamp(difference, -player.speed * dt, player.speed * dt);
        if (Math.abs(difference) < 2) player.targetX = null;
      }

      player.x = clamp(player.x, player.radius, width - player.radius);

      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        createObstacle();
        const interval = Math.max(0.42, 1.05 - (level - 1) * 0.045);
        spawnTimer = interval * (0.75 + Math.random() * 0.5);
      }

      for (let index = obstacles.length - 1; index >= 0; index--) {
        const obstacle = obstacles[index];
        obstacle.y += obstacle.speed * dt;

        const nearestX = clamp(player.x, obstacle.x, obstacle.x + obstacle.width);
        const nearestY = clamp(player.y, obstacle.y, obstacle.y + obstacle.height);
        const dx = player.x - nearestX;
        const dy = player.y - nearestY;

        if (dx * dx + dy * dy < player.radius * player.radius * 0.82) {
          addSplash(player.x, player.y, '#ffffff', 28, 210);
          finishGame();
          break;
        }

        // Trigger once when a log has safely passed the player.
        if (!obstacle.passed && obstacle.y > player.y + player.radius) {
          obstacle.passed = true;
          const gap = horizontalGapToPlayer(obstacle);

          if (gap < player.radius + 42) {
            addSplash(player.x, player.y + 10, '#f4ffff', 20, 185);
            addFloatingText(player.x, player.y - 30, 'SPLASH! +1');
            awardPoints(2, player.x, player.y - 48, '');
            playTone(600, 0.1, 'sine', 0.025);
          } else {
            awardPoints(1, player.x, player.y - 35, '');
          }
        }

        if (obstacle.y > height + obstacle.height) {
          obstacles.splice(index, 1);
        }
      }
    }

    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index];
      particle.life -= dt;

      if (particle.kind === 'ring') {
        const progress = 1 - particle.life / particle.maxLife;
        particle.radius = particle.maxRadius * progress;
      } else {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 190 * dt;
      }

      if (particle.life <= 0) particles.splice(index, 1);
    }

    for (let index = floatingTexts.length - 1; index >= 0; index--) {
      const item = floatingTexts[index];
      item.life -= dt;
      item.y -= 27 * dt;
      if (item.life <= 0) floatingTexts.splice(index, 1);
    }
  }

  function drawWater() {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#d7f9ff');
    gradient.addColorStop(.52, '#8bd8ed');
    gradient.addColorStop(1, '#42b5d0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    for (const wave of waves) {
      const baseY = height * wave.y;
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      for (let x = 0; x <= width + 10; x += 10) {
        const y = baseY + Math.sin(x * .018 + worldTime * wave.speed + wave.phase) * wave.amplitude;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fillStyle = `rgba(255,255,255,${wave.alpha})`;
      ctx.fill();
    }

    for (let index = 0; index < 11; index++) {
      const x = ((index * 127 + worldTime * (15 + index * 2)) % (width + 80)) - 40;
      const y = height * (.1 + ((index * 29) % 76) / 100);
      ctx.beginPath();
      ctx.ellipse(x, y, 13 + (index % 3) * 5, 2, -.12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.32)';
      ctx.fill();
    }
  }

  function roundedRectangle(x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawObstacle(obstacle) {
    ctx.save();
    ctx.shadowColor = 'rgba(75, 43, 16, .22)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;

    const gradient = ctx.createLinearGradient(0, obstacle.y, 0, obstacle.y + obstacle.height);
    gradient.addColorStop(0, `hsl(${obstacle.hue}, 72%, 57%)`);
    gradient.addColorStop(1, `hsl(${obstacle.hue}, 67%, 36%)`);
    ctx.fillStyle = gradient;
    roundedRectangle(obstacle.x, obstacle.y, obstacle.width, obstacle.height, obstacle.height / 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(78, 43, 17, .42)';
    ctx.lineWidth = 2;

    for (let index = 1; index <= 2; index++) {
      const knotX = obstacle.x + obstacle.width * index / 3;
      ctx.beginPath();
      ctx.ellipse(knotX, obstacle.y + obstacle.height / 2, obstacle.height * .2, obstacle.height * .33, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawPlayer() {
    const bob = state === 'playing'
      ? Math.sin(worldTime * 7) * 2
      : Math.sin(worldTime * 2.5) * 3;
    const y = player.y + bob;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 85, 145, .3)';
    ctx.shadowBlur = 13;
    ctx.shadowOffsetY = 5;

    const gradient = ctx.createRadialGradient(
      player.x - 5, y - 7, 2,
      player.x, y, player.radius * 1.2
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(.25, '#8ce9ff');
    gradient.addColorStop(1, '#087db5');
    ctx.fillStyle = gradient;

    ctx.beginPath();
    ctx.moveTo(player.x, y - player.radius);
    ctx.bezierCurveTo(
      player.x + player.radius * .3, y - player.radius * .25,
      player.x + player.radius, y + player.radius * .2,
      player.x + player.radius * .72, y + player.radius * .68
    );
    ctx.quadraticCurveTo(
      player.x, y + player.radius * 1.48,
      player.x - player.radius * .72, y + player.radius * .68
    );
    ctx.bezierCurveTo(
      player.x - player.radius, y + player.radius * .2,
      player.x - player.radius * .3, y - player.radius * .25,
      player.x, y - player.radius
    );
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(player.x - 4, y - 3, 3, 5, -.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.fill();
  }

  function drawEffects() {
    for (const particle of particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = particle.color;
      ctx.fillStyle = particle.color;

      if (particle.kind === 'ring') {
        ctx.beginPath();
        ctx.ellipse(particle.x, particle.y, particle.radius * 1.5, particle.radius * .55, 0, 0, Math.PI * 2);
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(particle.x, particle.y, particle.radius * .7, particle.radius * 1.35, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;

    for (const item of floatingTexts) {
      ctx.globalAlpha = clamp(item.life / item.maxLife, 0, 1);
      ctx.font = '800 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(4, 77, 111, .55)';
      ctx.fillStyle = '#ffffff';
      ctx.strokeText(item.text, item.x, item.y);
      ctx.fillText(item.text, item.x, item.y);
    }

    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
  }

  function render() {
    drawWater();
    for (const obstacle of obstacles) drawObstacle(obstacle);
    drawPlayer();
    drawEffects();
  }

  function animationFrame(timestamp) {
    const dt = lastFrameTime
      ? Math.min((timestamp - lastFrameTime) / 1000, .04)
      : 0;

    lastFrameTime = timestamp;
    update(dt);
    render();
    window.requestAnimationFrame(animationFrame);
  }

  function pointerX(event) {
    const rect = canvas.getBoundingClientRect();
    return (event.clientX - rect.left) * (width / rect.width);
  }

  function openLeaderboard(returnState) {
    leaderboardReturnState = returnState;
    renderLeaderboard();
    state = 'leaderboard';
    showOnly('leaderboard');
  }

  function renderLeaderboard() {
    elements.leaderboardList.replaceChildren();
    elements.leaderboardEmpty.hidden = savedScores.length > 0;

    savedScores
      .slice()
      .sort((a, b) => b.score - a.score || b.date - a.date)
      .slice(0, MAX_SCORES)
      .forEach((entry, index) => {
        const item = document.createElement('li');
        const rank = document.createElement('span');
        const player = document.createElement('span');
        const date = document.createElement('span');
        const scoreNode = document.createElement('span');

        rank.className = 'rank';
        rank.textContent = `#${index + 1}`;
        player.className = 'player-entry';
        player.textContent = entry.name;
        date.className = 'entry-date';
        date.textContent = Number.isFinite(entry.date)
          ? new Date(entry.date).toLocaleDateString()
          : '';
        scoreNode.className = 'entry-score';
        scoreNode.textContent = String(entry.score);

        player.append(date);
        item.append(rank, player, scoreNode);
        elements.leaderboardList.append(item);
      });
  }

  function closeLeaderboard() {
    if (leaderboardReturnState === 'gameover') {
      state = 'gameover';
      showOnly('gameOver');
    } else {
      state = 'menu';
      showOnly('menu');
    }
  }

  elements.scoreForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state !== 'gameover' || scoreSavedThisRun) return;

    const name = elements.playerName.value.trim().slice(0, 18) || 'Player';
    savedScores.push({ name, score, date: Date.now() });
    savedScores.sort((a, b) => b.score - a.score || b.date - a.date);
    savedScores = savedScores.slice(0, MAX_SCORES);
    scoreSavedThisRun = true;

    const stored = persistScores();
    updateBestScore();
    elements.finalBest.textContent = `Browser best: ${bestScore}`;
    elements.saveStatus.textContent = stored
      ? 'Score saved on this browser.'
      : 'Could not save here. Browser storage may be disabled.';
    elements.playerName.disabled = true;
    elements.scoreForm.querySelector('button[type="submit"]').disabled = true;
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (state !== 'playing') return;
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    player.targetX = pointerX(event);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (state !== 'playing') return;
    if (event.buttons || event.pointerType === 'touch') {
      player.targetX = pointerX(event);
    }
  });

  document.addEventListener('keydown', (event) => {
    const key = event.key;

    if (['ArrowLeft', 'ArrowRight', ' '].includes(key)) event.preventDefault();

    if ((key === 'p' || key === 'P' || key === 'Escape') && !event.repeat) {
      if (state === 'playing') pauseGame();
      else if (state === 'paused') resumeGame();
      return;
    }

    if (state === 'playing') keysDown.add(key);

    if ((key === 'Enter' || key === ' ') && (state === 'menu' || state === 'gameover')) {
      startGame();
    }
  });

  document.addEventListener('keyup', (event) => keysDown.delete(event.key));
  window.addEventListener('blur', () => {
    if (state === 'playing') pauseGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') pauseGame();
  });
  window.addEventListener('resize', resizeCanvas);

  if ('ResizeObserver' in window) {
    new ResizeObserver(resizeCanvas).observe(shell);
  }

  elements.start.addEventListener('click', startGame);
  elements.resume.addEventListener('click', resumeGame);
  elements.pauseRestart.addEventListener('click', startGame);
  elements.playAgain.addEventListener('click', startGame);
  elements.pauseButton.addEventListener('click', () => {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  });
  elements.menuScores.addEventListener('click', () => openLeaderboard('menu'));
  elements.gameOverScores.addEventListener('click', () => openLeaderboard('gameover'));
  elements.leaderboardBack.addEventListener('click', closeLeaderboard);

  elements.sound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    setSoundButton();
    if (soundEnabled) playTone(520, .1, 'sine', .03);
  });

  setSoundButton();
  updateHud();
  resizeCanvas();
  window.requestAnimationFrame(animationFrame);
})();
