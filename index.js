
(() => {
    'use strict';

    const APP_ID = 'st-mini-game-center';
    const BOARD_SIZE = 4;

    const state = {
        currentGame: null,
        mines: null,
        game2048: null,
        sokoban: null,
    };

    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'class') node.className = v;
            else if (k === 'text') node.textContent = v;
            else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
            else node.setAttribute(k, v);
        });
        for (const child of children) node.append(child);
        return node;
    }

    function inject() {
        if (document.getElementById(APP_ID)) return;

        const launcher = el('button', {
            id: `${APP_ID}-launcher`,
            class: 'stgc-launcher',
            title: 'Silly Game',
            text: '🎮'
        });
        launcher.addEventListener('click', openCenter);
        document.body.append(launcher);
    }

    function openCenter() {
        let root = document.getElementById(APP_ID);
        if (!root) {
            root = el('div', { id: APP_ID, class: 'stgc-overlay' });
            root.addEventListener('click', e => {
                if (e.target === root) closeCenter();
            });
            document.body.append(root);
        }
        root.classList.add('show');
        renderHome();
    }

    function closeCenter() {
        document.getElementById(APP_ID)?.classList.remove('show');
    }

    function renderHome() {
        const root = document.getElementById(APP_ID);
        root.innerHTML = '';

        const panel = el('section', { class: 'stgc-panel' });
        const header = el('header', { class: 'stgc-header' }, [
            el('div', { class: 'stgc-title', text: '🎮 小游戏中心' }),
            el('button', { class: 'stgc-close', text: '×', title: '关闭' })
        ]);
        header.lastChild.addEventListener('click', closeCenter);

        const subtitle = el('div', {
            class: 'stgc-subtitle',
            text: '离开聊天也能随手玩两把 · 手机 / 电脑均可'
        });

        const grid = el('div', { class: 'stgc-menu-grid' });

        const games = [
            { id: 'mines', icon: '💣', name: '扫雷', desc: '经典扫雷，支持触屏标记' },
            { id: '2048', icon: '🔢', name: '2048', desc: '滑动合并数字' },
            { id: 'sokoban', icon: '📦', name: '推箱子', desc: '把箱子推到目标点' },
        ];

        games.forEach(game => {
            const card = el('button', { class: 'stgc-game-card' });
            card.append(
                el('div', { class: 'stgc-card-icon', text: game.icon }),
                el('div', { class: 'stgc-card-name', text: game.name }),
                el('div', { class: 'stgc-card-desc', text: game.desc })
            );
            card.addEventListener('click', () => openGame(game.id));
            grid.append(card);
        });

        panel.append(header, subtitle, grid);
        root.append(panel);
    }

    function openGame(game) {
        state.currentGame = game;
        const root = document.getElementById(APP_ID);
        root.innerHTML = '';

        const panel = el('section', { class: 'stgc-panel stgc-game-panel' });
        const header = el('header', { class: 'stgc-header' });
        const back = el('button', { class: 'stgc-back', text: '‹ 游戏中心' });
        back.addEventListener('click', renderHome);
        header.append(back);

        const close = el('button', { class: 'stgc-close', text: '×', title: '关闭' });
        close.addEventListener('click', closeCenter);
        header.append(close);

        panel.append(header);

        const body = el('div', { class: 'stgc-game-body' });
        panel.append(body);
        root.append(panel);

        if (game === 'mines') renderMinesweeper(body);
        if (game === '2048') render2048(body);
        if (game === 'sokoban') renderSokoban(body);
    }

    /* -------------------- Minesweeper -------------------- */

    function createMinesweeper() {
        const size = 9, mineCount = 10;
        const cells = Array.from({ length: size * size }, () => ({
            mine: false, open: false, flag: false, count: 0
        }));

        let placed = 0;
        while (placed < mineCount) {
            const i = Math.floor(Math.random() * cells.length);
            if (!cells[i].mine) {
                cells[i].mine = true;
                placed++;
            }
        }

        for (let i = 0; i < cells.length; i++) {
            if (cells[i].mine) continue;
            const x = i % size, y = Math.floor(i / size);
            let count = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    const nx = x + dx, ny = y + dy;
                    if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
                        if (cells[ny * size + nx].mine) count++;
                    }
                }
            }
            cells[i].count = count;
        }

        return { size, mineCount, cells, gameOver: false, won: false, flags: 0, mode: 'open' };
    }
function minesChord(index) {
    const s = state.mines;
    if (s.gameOver || s.won) return;

    const cell = s.cells[index];

    // 必须是已经翻开的数字格
    if (!cell.open || cell.count === 0) return;

    const x = index % s.size;
    const y = Math.floor(index / s.size);

    const neighbors = [];

    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;

            const nx = x + dx;
            const ny = y + dy;

            if (
                nx >= 0 &&
                nx < s.size &&
                ny >= 0 &&
                ny < s.size
            ) {
                neighbors.push(ny * s.size + nx);
            }
        }
    }

    // 统计周围旗子数量
    const flagCount = neighbors.filter(
        i => s.cells[i].flag
    ).length;

    // 只有旗子数量等于数字时，才自动展开
    if (flagCount !== cell.count) return;

    for (const i of neighbors) {
        const target = s.cells[i];

        if (!target.open && !target.flag) {
            minesReveal(i);
        }
    }
}
    function minesReveal(index) {
        const s = state.mines;
        if (s.gameOver || s.won) return;
        const cell = s.cells[index];
        if (cell.open || cell.flag) return;

        cell.open = true;
        if (cell.mine) {
            s.gameOver = true;
            s.cells.forEach(c => { if (c.mine) c.open = true; });
            return;
        }

        if (cell.count === 0) {
            const x = index % s.size, y = Math.floor(index / s.size);
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    const nx = x + dx, ny = y + dy;
                    if (nx >= 0 && nx < s.size && ny >= 0 && ny < s.size) {
                        const ni = ny * s.size + nx;
                        if (!s.cells[ni].open && !s.cells[ni].flag) minesReveal(ni);
                    }
                }
            }
        }

        const safe = s.cells.filter(c => !c.mine);
        if (safe.every(c => c.open)) s.won = true;
    }

    function minesFlag(index) {
        const s = state.mines;
        if (s.gameOver || s.won) return;
        const cell = s.cells[index];
        if (cell.open) return;
        if (!cell.flag && s.flags >= s.mineCount) return;
        cell.flag = !cell.flag;
        s.flags += cell.flag ? 1 : -1;
    }

    function renderMinesweeper(body) {
        state.mines = createMinesweeper();

        const top = el('div', { class: 'stgc-status-row' });
        const info = el('div', { class: 'stgc-status-text' });
        const reset = el('button', { class: 'stgc-small-btn', text: '重新开始' });
        reset.addEventListener('click', () => renderMinesweeper(body));

        const mode = el('button', { class: 'stgc-small-btn', text: '🚩 标记模式：关' });
        mode.addEventListener('click', () => {
            state.mines.mode = state.mines.mode === 'open' ? 'flag' : 'open';
            mode.textContent = state.mines.mode === 'flag' ? '🚩 标记模式：开' : '🚩 标记模式：关';
            draw();
        });

        top.append(info, mode, reset);

        const board = el('div', { class: 'mine-board' });
        body.append(
            el('h2', { class: 'stgc-game-title', text: '💣 扫雷' }),
            top,
            board
        );

        function draw() {
            const s = state.mines;
            board.innerHTML = '';

            info.textContent =
                s.gameOver ? '💥 踩雷了，再来一次！'
                : s.won ? '🎉 扫雷成功！'
                : `地雷 ${s.mineCount} · 已标记 ${s.flags}`;

            s.cells.forEach((cell, index) => {
                const btn = el('button', { class: `mine-cell${cell.open ? ' open' : ''}` });

                if (cell.flag && !cell.open) {
                    btn.textContent = '🚩';
                } else if (cell.open && cell.mine) {
                    btn.textContent = '💣';
                    btn.classList.add('mine');
                } else if (cell.open && cell.count > 0) {
                    btn.textContent = String(cell.count);
                    btn.dataset.n = String(cell.count);
                }

                btn.addEventListener('contextmenu', e => {
                    e.preventDefault();
                    minesFlag(index);
                    draw();
                });

btn.addEventListener('click', () => {
    if (state.mines.mode === 'flag') {
        minesFlag(index);
    } else {
        const cell = state.mines.cells[index];

        // 已经翻开的数字格：执行自动展开
        if (cell.open && cell.count > 0) {
            minesChord(index);
        } else {
            minesReveal(index);
        }
    }

    draw();
});

                board.append(btn);
            });
        }

        draw();
    }

    /* -------------------- 2048 -------------------- */

    function new2048() {
        const board = Array.from({ length: 16 }, () => 0);
        const s = { board, score: 0, over: false };
        add2048Tile(s); add2048Tile(s);
        return s;
    }

    function add2048Tile(s) {
        const empty = [];
        s.board.forEach((v, i) => { if (!v) empty.push(i); });
        if (!empty.length) return;
        const i = empty[Math.floor(Math.random() * empty.length)];
        s.board[i] = Math.random() < 0.9 ? 2 : 4;
    }

    function compress2048(line) {
        return line.filter(Boolean);
    }

    function merge2048(line, s) {
        const a = compress2048(line);
        const result = [];
        for (let i = 0; i < a.length; i++) {
            if (a[i] === a[i + 1]) {
                const v = a[i] * 2;
                result.push(v);
                s.score += v;
                i++;
            } else {
                result.push(a[i]);
            }
        }
        while (result.length < BOARD_SIZE) result.push(0);
        return result;
    }

    function move2048(dir) {
        const s = state.game2048;
        const old = s.board.slice();

        if (dir === 'left' || dir === 'right') {
            for (let y = 0; y < 4; y++) {
                let row = s.board.slice(y * 4, y * 4 + 4);
                if (dir === 'right') row.reverse();
                row = merge2048(row, s);
                if (dir === 'right') row.reverse();
                s.board.splice(y * 4, 4, ...row);
            }
        } else {
            for (let x = 0; x < 4; x++) {
                let col = [s.board[x], s.board[x + 4], s.board[x + 8], s.board[x + 12]];
                if (dir === 'down') col.reverse();
                col = merge2048(col, s);
                if (dir === 'down') col.reverse();
                [0,1,2,3].forEach(y => s.board[y * 4 + x] = col[y]);
            }
        }

        if (old.some((v, i) => v !== s.board[i])) add2048Tile(s);

        if (!canMove2048(s)) s.over = true;
    }

    function canMove2048(s) {
        if (s.board.some(v => v === 0)) return true;
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                const i = y * 4 + x;
                if (x < 3 && s.board[i] === s.board[i + 1]) return true;
                if (y < 3 && s.board[i] === s.board[i + 4]) return true;
            }
        }
        return false;
    }

    function render2048(body) {
        state.game2048 = new2048();

        const title = el('h2', { class: 'stgc-game-title', text: '🔢 2048' });
        const status = el('div', { class: 'stgc-2048-bar' });
        const score = el('span');
        const reset = el('button', { class: 'stgc-small-btn', text: '重新开始' });
        reset.addEventListener('click', () => render2048(body));
        status.append(score, reset);

        const board = el('div', { class: 'board-2048' });
        body.append(title, status, board);

        function draw() {
            const s = state.game2048;
            board.innerHTML = '';
            score.textContent = `分数 ${s.score}${s.over ? ' · 游戏结束' : ''}`;

            s.board.forEach(v => {
                const cell = el('div', { class: 'tile-2048' });
                if (v) {
                    cell.textContent = v;
                    cell.dataset.v = v;
                }
                board.append(cell);
            });
        }

        let sx = 0, sy = 0;
        board.addEventListener('touchstart', e => {
            const t = e.changedTouches[0];
            sx = t.clientX; sy = t.clientY;
        }, { passive: true });

        board.addEventListener('touchend', e => {
            const t = e.changedTouches[0];
            const dx = t.clientX - sx, dy = t.clientY - sy;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 25) return;
            if (Math.abs(dx) > Math.abs(dy)) move2048(dx > 0 ? 'right' : 'left');
            else move2048(dy > 0 ? 'down' : 'up');
            draw();
        }, { passive: true });

        const onKey = e => {
            if (state.currentGame !== '2048') return;
            const map = {
                ArrowLeft: 'left', ArrowRight: 'right',
                ArrowUp: 'up', ArrowDown: 'down'
            };
            if (!map[e.key]) return;
            e.preventDefault();
            move2048(map[e.key]);
            draw();
        };

        document.addEventListener('keydown', onKey);
        body._stgcCleanup = () => document.removeEventListener('keydown', onKey);

        draw();
    }

    /* -------------------- Sokoban -------------------- */

    const SOKO_LEVEL = [
        '########',
        '#      #',
        '# .  $ #',
        '#  $$  #',
        '#  @ . #',
        '#      #',
        '# .    #',
        '########',
    ];

    function newSokoban() {
        const cells = SOKO_LEVEL.map(row => row.split(''));
        let px = 0, py = 0;
        const boxes = [];
        const targets = [];
        for (let y = 0; y < cells.length; y++) {
            for (let x = 0; x < cells[y].length; x++) {
                const c = cells[y][x];
                if (c === '@') { px = x; py = y; cells[y][x] = ' '; }
                if (c === '$') { boxes.push({x,y}); cells[y][x] = ' '; }
                if (c === '.') { targets.push(`${x},${y}`); cells[y][x] = ' '; }
            }
        }
        return { cells, px, py, boxes, targets, moves: 0, won: false };
    }

    function sokoBoxAt(s, x, y) {
        return s.boxes.find(b => b.x === x && b.y === y);
    }

    function sokoWall(s, x, y) {
        return s.cells[y]?.[x] === '#';
    }

    function sokoMove(dx, dy) {
        const s = state.sokoban;
        if (s.won) return;

        const nx = s.px + dx, ny = s.py + dy;
        if (sokoWall(s, nx, ny)) return;

        const box = sokoBoxAt(s, nx, ny);
        if (box) {
            const bx = nx + dx, by = ny + dy;
            if (sokoWall(s, bx, by) || sokoBoxAt(s, bx, by)) return;
            box.x = bx; box.y = by;
        }

        s.px = nx; s.py = ny;
        s.moves++;
        s.won = s.boxes.every(b => s.targets.includes(`${b.x},${b.y}`));
    }

    function renderSokoban(body) {
        state.sokoban = newSokoban();

        const title = el('h2', { class: 'stgc-game-title', text: '📦 推箱子' });
        const status = el('div', { class: 'stgc-status-row' });
        const info = el('div', { class: 'stgc-status-text' });
        const reset = el('button', { class: 'stgc-small-btn', text: '重新开始' });
        reset.addEventListener('click', () => renderSokoban(body));
        status.append(info, reset);

        const board = el('div', { class: 'soko-board' });
        const controls = el('div', { class: 'soko-controls' });

        const buttons = [
            ['↑', 0, -1],
            ['←', -1, 0],
            ['↓', 0, 1],
            ['→', 1, 0],
        ];
        buttons.forEach(([txt, dx, dy]) => {
            const b = el('button', { class: 'soko-control', text: txt });
            b.addEventListener('click', () => { sokoMove(dx, dy); draw(); });
            controls.append(b);
        });

        body.append(title, status, board, controls);

        const onKey = e => {
            if (state.currentGame !== 'sokoban') return;
            const map = {
                ArrowLeft: [-1,0], ArrowRight: [1,0],
                ArrowUp: [0,-1], ArrowDown: [0,1],
                a: [-1,0], d: [1,0], w: [0,-1], s: [0,1]
            };
            const move = map[e.key];
            if (!move) return;
            e.preventDefault();
            sokoMove(...move);
            draw();
        };
        document.addEventListener('keydown', onKey);
        body._stgcCleanup = () => document.removeEventListener('keydown', onKey);

        function draw() {
            const s = state.sokoban;
            board.innerHTML = '';
            info.textContent = s.won ? `🎉 通关！共 ${s.moves} 步` : `步数 ${s.moves}`;

            for (let y = 0; y < s.cells.length; y++) {
                for (let x = 0; x < s.cells[y].length; x++) {
                    const tile = el('div', { class: 'soko-tile' });
                    if (s.cells[y][x] === '#') tile.classList.add('wall');

                    if (s.targets.includes(`${x},${y}`)) {
                        tile.classList.add('target');
                    }

                    const box = sokoBoxAt(s, x, y);
                    if (box) tile.classList.add('box');

                    if (s.px === x && s.py === y) tile.classList.add('player');

                    if (box && s.targets.includes(`${x},${y}`)) {
                        tile.classList.add('done');
                    }

                    board.append(tile);
                }
            }
        }

        draw();
    }

    function cleanupOldGame() {
        const body = document.querySelector('.stgc-game-body');
        body?._stgcCleanup?.();
    }

    // Re-rendering game views should remove old key handlers.
    const originalOpenGame = openGame;
    openGame = function(game) {
        cleanupOldGame();
        originalOpenGame(game);
    };

    function init() {
        inject();
        console.log('[小游戏中心] loaded');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
