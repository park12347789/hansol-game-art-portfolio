'use strict';

const BATTLE_ROLES = Object.freeze({
  guard: { cost: 4, hp: 52, speed: 5, range: 22, damage: 6, rate: .8 },
  raider: { cost: 3, hp: 40, speed: 12, range: 7, damage: 9, rate: .7 },
  gunner: { cost: 6, hp: 24, speed: 4, range: 50, damage: 12, rate: 1.6 }
});

class BattleSimulation {
  constructor() { this.reset(); }

  reset() {
    this.phase = 'ready';
    this.time = 0;
    this.energy = { left: 6, right: 6 };
    this.bases = { left: 120, right: 120 };
    this.units = [];
    this.queue = { left: null, right: null };
    this.nextAuto = { left: .7, right: .7 };
    this.autoIndex = { left: 0, right: 0 };
    this.id = 0;
    this.result = '';
    this.effects = [];
  }

  start() { this.reset(); this.phase = 'running'; }

  requestSpawn(side, role) {
    if (this.phase !== 'running' || !BATTLE_ROLES[role] || this.queue[side]) return false;
    if (this.energy[side] < BATTLE_ROLES[role].cost || this.count(side) >= 6) return false;
    this.queue[side] = role;
    return true;
  }

  count(side) { return this.units.reduce((n, unit) => n + (unit.side === side ? 1 : 0), 0); }

  spawn(side, role, free = false) {
    const data = BATTLE_ROLES[role];
    if (!data || this.count(side) >= 6 || (!free && this.energy[side] < data.cost)) return false;
    if (!free) this.energy[side] -= data.cost;
    this.units.push({
      id: ++this.id, side, role, x: side === 'left' ? 38 : 282,
      hp: data.hp, cooldown: 0, attack: 0, hit: 0, step: this.id % 2
    });
    return true;
  }

  update(dt) {
    if (this.phase !== 'running') return;
    this.time = Math.min(38, this.time + dt);
    const finalPush = this.time >= 30;
    const regen = finalPush ? 2 : 1;
    for (const side of ['left', 'right']) {
      this.energy[side] = Math.min(10, this.energy[side] + regen * dt);
      if (this.queue[side]) {
        this.spawn(side, this.queue[side]);
        this.queue[side] = null;
      }
      if (this.time >= this.nextAuto[side]) {
        const order = ['raider', 'guard', 'gunner', 'raider'];
        this.spawn(side, order[this.autoIndex[side]++ % order.length], true);
        this.nextAuto[side] += finalPush ? 2.1 : 3.2;
      }
    }

    const hits = [];
    const moves = [];
    const positions = new Map(this.units.map((unit) => [unit.id, unit.x]));
    for (const unit of this.units) {
      const data = BATTLE_ROLES[unit.role];
      const direction = unit.side === 'left' ? 1 : -1;
      unit.cooldown = Math.max(0, unit.cooldown - dt);
      unit.attack = Math.max(0, unit.attack - dt);
      unit.hit = Math.max(0, unit.hit - dt);
      const unitX = positions.get(unit.id);
      const enemies = this.units.filter((other) => other.side !== unit.side && other.hp > 0);
      const target = enemies.sort((a, b) => Math.abs(positions.get(a.id) - unitX) - Math.abs(positions.get(b.id) - unitX))[0];
      if (target && Math.abs(positions.get(target.id) - unitX) <= data.range) {
        if (unit.cooldown === 0) {
          hits.push({ target, damage: data.damage });
          unit.cooldown = data.rate;
          unit.attack = .16;
        }
      } else {
        const enemyBaseX = unit.side === 'left' ? 302 : 18;
        if (Math.abs(enemyBaseX - unitX) <= data.range + 8) {
          if (unit.cooldown === 0) {
            hits.push({ base: unit.side === 'left' ? 'right' : 'left', damage: data.damage * .65 });
            unit.cooldown = data.rate;
            unit.attack = .16;
          }
        } else {
          moves.push({ unit, distance: direction * data.speed * (finalPush ? 1.25 : 1) * dt });
          unit.step += dt * data.speed;
        }
      }
    }

    for (const move of moves) move.unit.x += move.distance;
    for (const hit of hits) {
      if (hit.target) {
        hit.target.hp -= hit.damage;
        hit.target.hit = .12;
        this.effects.push({ x: hit.target.x, life: .18, side: hit.target.side });
      } else this.bases[hit.base] -= hit.damage;
    }
    this.units = this.units.filter((unit) => unit.hp > 0);
    this.effects.forEach((effect) => { effect.life -= dt; });
    this.effects = this.effects.filter((effect) => effect.life > 0);
    this.resolveSpacing('left');
    this.resolveSpacing('right');
    if (this.bases.left <= 0 || this.bases.right <= 0 || this.time >= 38) this.finish();
  }

  resolveSpacing(side) {
    const direction = side === 'left' ? -1 : 1;
    const list = this.units.filter((unit) => unit.side === side).sort((a, b) => side === 'left' ? b.x - a.x : a.x - b.x);
    for (let i = 1; i < list.length; i += 1) {
      if (Math.abs(list[i - 1].x - list[i].x) < 7) list[i].x = list[i - 1].x + direction * 7;
    }
  }

  finish() {
    this.phase = 'ended';
    const leftScore = Math.max(0, this.bases.left) + this.units.filter((u) => u.side === 'left').reduce((n, u) => n + u.hp, 0) * .1;
    const rightScore = Math.max(0, this.bases.right) + this.units.filter((u) => u.side === 'right').reduce((n, u) => n + u.hp, 0) * .1;
    this.result = Math.abs(leftScore - rightScore) < .01 ? 'DRAW' : leftScore > rightScore ? 'ASHLINE WINS' : 'RUSTMAW WINS';
  }
}

class PixelBattleRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('LINE_BATTLE_CANVAS_UNAVAILABLE');
    this.ctx.imageSmoothingEnabled = false;
    this.sprites = new Map();
  }

  sprite(side, role, frame = 0, attacking = false, hit = false) {
    const key = `${side}:${role}:${frame}:${attacking}:${hit}`;
    if (this.sprites.has(key)) return this.sprites.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (side === 'right') { ctx.translate(16, 0); ctx.scale(-1, 1); }
    const human = side === 'left';
    const p = human
      ? { ink: '#101820', body: '#d9d4b7', dark: '#526773', accent: '#d06d3d', skin: '#b99b72' }
      : { ink: '#172016', body: '#6f823d', dark: '#394428', accent: '#a74d2b', skin: '#99aa53' };
    const r = (x, y, w, h, color) => { ctx.fillStyle = hit ? '#fff' : color; ctx.fillRect(x, y, w, h); };
    const leg = frame ? 1 : 0;
    if (role === 'guard') {
      r(3, 3, 7, 8, p.ink); r(4, 2, 5, 2, p.ink); r(4, 3, 5, 3, p.body); r(5, 6, 5, 5, p.dark);
      r(4 + leg, 11, 2, 4, p.ink); r(8 - leg, 11, 2, 4, p.ink); r(9, attacking ? 7 : 8, 6, 2, p.ink); r(11, attacking ? 7 : 8, 3, 1, p.accent);
    } else if (role === 'raider') {
      r(2, 5, 8, 7, p.ink); r(4, 3, 5, 4, p.skin); r(3, 4, 7, 2, p.body); r(4, 8, 6, 4, p.accent);
      r(3 + leg, 12, 2, 3, p.ink); r(8 - leg, 12, 3, 2, p.ink); r(9, attacking ? 5 : 7, 6, 1, p.body); r(13, attacking ? 3 : 5, 2, 2, p.ink);
    } else {
      r(1, 5, 4, 8, p.ink); r(4, 3, 7, 9, p.ink); r(5, 2, 5, 4, p.body); r(5, 6, 5, 6, p.dark);
      r(5 + leg, 12, 2, 3, p.ink); r(9 - leg, 12, 2, 3, p.ink); r(9, attacking ? 6 : 7, 7, 3, p.ink); r(11, attacking ? 6 : 7, 4, 1, p.accent);
    }
    this.sprites.set(key, canvas);
    return canvas;
  }

  drawIcon(canvas, side, role) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('LINE_BATTLE_ICON_CANVAS_UNAVAILABLE');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 16, 16);
    ctx.drawImage(this.sprite(side, role), 0, 0);
  }

  render(simulation) {
    const c = this.ctx;
    c.clearRect(0, 0, 320, 96);
    c.fillStyle = '#151913'; c.fillRect(0, 0, 320, 96);
    c.fillStyle = '#22271d'; c.fillRect(0, 58, 320, 38);
    c.fillStyle = '#34392b';
    for (let x = 0; x < 320; x += 13) c.fillRect(x, 76 + (x % 3), 8, 1);
    c.fillStyle = '#858c78';
    for (let x = 70; x < 260; x += 46) { c.fillRect(x, 61, 1, 17); c.fillRect(x - 4, 65, 9, 1); c.fillRect(x - 3, 69, 7, 1); }
    this.drawBase('left', simulation.bases.left);
    this.drawBase('right', simulation.bases.right);
    for (const unit of simulation.units) {
      const frame = Math.floor(unit.step) % 2;
      const bob = frame && unit.attack === 0 ? -1 : 0;
      c.drawImage(this.sprite(unit.side, unit.role, frame, unit.attack > 0, unit.hit > 0), Math.round(unit.x) - 8, 62 + bob);
      c.fillStyle = '#080a09'; c.fillRect(Math.round(unit.x) - 6, 59, 12, 2);
      c.fillStyle = unit.side === 'left' ? '#74b8c4' : '#d6bc64';
      c.fillRect(Math.round(unit.x) - 6, 59, Math.max(0, Math.round(12 * unit.hp / BATTLE_ROLES[unit.role].hp)), 1);
    }
    for (const effect of simulation.effects) {
      c.fillStyle = effect.side === 'left' ? '#d6bc64' : '#74b8c4';
      c.fillRect(Math.round(effect.x) - 2, 66, 1, 1); c.fillRect(Math.round(effect.x) + 2, 63, 1, 1);
    }
    if (simulation.phase !== 'running') this.overlay(simulation.phase === 'ended' ? simulation.result : 'PRESS START');
  }

  drawBase(side, hp) {
    const c = this.ctx;
    if (side === 'left') {
      c.fillStyle = '#101820'; c.fillRect(4, 51, 31, 28); c.fillRect(11, 44, 17, 8); c.fillRect(18, 40, 3, 5); c.fillRect(26, 47, 16, 2);
      c.fillStyle = '#526773'; c.fillRect(7, 55, 25, 14); c.fillStyle = '#d9d4b7'; c.fillRect(14, 47, 10, 4); c.fillRect(28, 47, 11, 1);
      c.fillStyle = '#74b8c4'; c.fillRect(8, 71, Math.round(24 * Math.max(0, hp) / 120), 2);
    } else {
      c.fillStyle = '#172016'; c.fillRect(285, 48, 29, 31); c.fillRect(294, 35, 4, 14); c.fillRect(304, 40, 3, 10); c.fillRect(290, 37, 21, 2);
      c.fillStyle = '#6f823d'; c.fillRect(289, 53, 21, 18); c.fillStyle = '#a74d2b'; c.fillRect(284, 45, 7, 5); c.fillRect(308, 33, 3, 20);
      c.fillStyle = '#d6bc64'; c.fillRect(288, 71, Math.round(24 * Math.max(0, hp) / 120), 2);
    }
  }

  overlay(text) {
    const c = this.ctx;
    c.fillStyle = 'rgba(8,10,9,.78)'; c.fillRect(100, 34, 120, 25);
    c.strokeStyle = '#c9ff2e'; c.strokeRect(100.5, 34.5, 119, 24);
    c.fillStyle = '#f2f0df'; c.font = '600 8px monospace'; c.textAlign = 'center'; c.fillText(text, 160, 49); c.textAlign = 'start';
  }
}

class ILineBattleWidget {
  constructor(root) {
    this.root = root;
    this.canvas = root.querySelector('[data-battle-canvas]');
    this.startButton = root.querySelector('[data-battle-start]');
    this.status = root.querySelector('[data-battle-status]');
    this.live = root.querySelector('[data-battle-live]');
    this.spawnButtons = [...root.querySelectorAll('[data-spawn]')];
    this.simulation = new BattleSimulation();
    this.renderer = new PixelBattleRenderer(this.canvas);
    this.last = 0;
    this.accumulator = 0;
    this.frame = 0;
    this.hidden = document.hidden;
  }

  init() {
    this.root.dataset.phase = 'ready';
    this.startButton.addEventListener('click', () => this.start());
    for (const button of this.spawnButtons) {
      const [side, role] = button.dataset.spawn.split(':');
      button.setAttribute('aria-label', `${side === 'left' ? '애쉬라인' : '러스트모'} ${role} 증원, 비용 ${BATTLE_ROLES[role].cost}`);
      button.addEventListener('click', () => this.spawn(side, role));
      this.renderer.drawIcon(button.querySelector('canvas'), side, role);
    }
    document.addEventListener('keydown', (event) => this.onKey(event));
    document.addEventListener('visibilitychange', () => { this.hidden = document.hidden; this.last = 0; });
    new MutationObserver(() => { this.last = 0; }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    this.renderer.render(this.simulation);
    this.syncControls();
  }

  start() {
    this.simulation.start();
    this.root.dataset.phase = 'running';
    this.startButton.textContent = 'RESTART';
    this.live.textContent = '라인 배틀 시작';
    this.last = 0;
    if (!this.frame) this.frame = requestAnimationFrame((time) => this.tick(time));
    this.syncControls();
  }

  spawn(side, role) {
    if (!this.simulation.requestSpawn(side, role)) return;
    this.syncControls();
  }

  onKey(event) {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    const keys = { q: ['left', 'guard'], w: ['left', 'raider'], e: ['left', 'gunner'], i: ['right', 'guard'], o: ['right', 'raider'], p: ['right', 'gunner'] };
    const command = keys[event.key.toLowerCase()];
    if (command) { event.preventDefault(); this.spawn(...command); }
  }

  tick(time) {
    const paused = this.hidden || document.body.classList.contains('motion-paused');
    if (!paused && this.simulation.phase === 'running') {
      if (!this.last) this.last = time;
      this.accumulator += Math.min(.1, (time - this.last) / 1000);
      this.last = time;
      let steps = 0;
      while (this.accumulator >= 1 / 30 && steps < 3) { this.simulation.update(1 / 30); this.accumulator -= 1 / 30; steps += 1; }
    } else this.last = time;
    this.renderer.render(this.simulation);
    this.syncControls();
    if (this.simulation.phase === 'ended') {
      this.root.dataset.phase = 'ended';
      this.status.textContent = this.simulation.result;
      this.live.textContent = `전투 종료, ${this.simulation.result}`;
      this.frame = 0;
      return;
    }
    this.frame = requestAnimationFrame((next) => this.tick(next));
  }

  syncControls() {
    const running = this.simulation.phase === 'running';
    this.root.querySelector('[data-battle-energy="left"]').textContent = `CMD ${Math.floor(this.simulation.energy.left).toString().padStart(2, '0')}`;
    this.root.querySelector('[data-battle-energy="right"]').textContent = `CMD ${Math.floor(this.simulation.energy.right).toString().padStart(2, '0')}`;
    if (running) this.status.textContent = `${Math.ceil(38 - this.simulation.time).toString().padStart(2, '0')} SEC`;
    for (const button of this.spawnButtons) {
      const [side, role] = button.dataset.spawn.split(':');
      button.disabled = !running || this.simulation.energy[side] < BATTLE_ROLES[role].cost || this.simulation.count(side) >= 6 || Boolean(this.simulation.queue[side]);
    }
  }
}

if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-line-battle]');
  if (root) {
    try { new ILineBattleWidget(root).init(); }
    catch (error) {
      console.error('LINE_BATTLE_INIT_FAILED', error);
      const start = root.querySelector('[data-battle-start]');
      start.disabled = true; start.textContent = 'ERROR';
    }
  }
}

if (typeof module !== 'undefined') module.exports = { BattleSimulation };
if (typeof require !== 'undefined' && require.main === module) {
  const assert = require('node:assert/strict');
  const game = new BattleSimulation();
  assert.equal(game.requestSpawn('left', 'guard'), false);
  game.start();
  assert.equal(game.requestSpawn('left', 'guard'), true);
  assert.equal(game.requestSpawn('left', 'raider'), false);
  game.update(1 / 30);
  assert.equal(game.count('left'), 1);
  assert(game.energy.left >= 0);
  for (let i = 0; i < 38 * 30 + 2; i += 1) game.update(1 / 30);
  assert.equal(game.phase, 'ended');
  assert.match(game.result, /WINS|DRAW/);
  const mirror = new BattleSimulation();
  mirror.start();
  for (let i = 0; i < 38 * 30 + 2; i += 1) mirror.update(1 / 30);
  assert.equal(mirror.result, 'DRAW');
  console.log('line-battle self-check passed');
}
