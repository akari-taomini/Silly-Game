(() => {
    'use strict';

    const APP_ID = 'st-mini-game-center';

    const state = {
        currentGame: null,
        cleanup: null,
        mines: null,
        game2048: null,
        sokoban: null,
        sudoku: null,
    };

    function el(tag, attrs = {}, children = []) {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(attrs)) {
            if (key === 'class') node.className = value;
            else if (key === 'text') node.textContent = value;
            else if (key === 'html') node.innerHTML = value;
            else node.setAttribute(key, value);
        }
        for (const child of children) node.append(child);
        return node;
    }

    function cleanupGame() {
        if (typeof state.cleanup === 'function') state.cleanup();
        state.cleanup = null;
    }

    function injectLauncher() {
        if (document.getElementById(`${APP_ID}-launcher`)) return;

        const launcher = el('button', {
            id: `${APP_ID}-launcher`,
            class: 'stgc-launcher menu_button',
            title: '小游戏中心',
            'aria-label': '打开小游戏中心',
        });
        launcher.innerHTML = '<i class="fa-solid fa-gamepad" aria-hidden="true"></i>';
        launcher.addEventListener('click', openCenter);
        document.body.append(launcher);
    }

    function ensureRoot() {
        let root = document.getElementById(APP_ID);
        if (root) return root;

        root = el('div', {
            id: APP_ID,
            class: 'stgc-overlay',
            'aria-hidden': 'true',
        });

        root.addEventListener('click', event => {
            if (event.target === root) closeCenter();
        });

        document.body.append(root);
        return root;
    }

    function openCenter() {
        cleanupGame();
        const root = ensureRoot();
        root.classList.add('show');
        root.setAttribute('aria-hidden', 'false');
        renderHome();
    }

    function closeCenter() {
        cleanupGame();
        const root = document.getElementById(APP_ID);
        if (!root) return;
        root.classList.remove('show');
        root.setAttribute('aria-hidden', 'true');
        state.currentGame = null;
    }

    function buildHeader({ back = false, title = '小游戏中心' } = {}) {
        const header = el('header', { class: 'stgc-header' });

        if (back) {
            const backBtn = el('button', {
                class: 'stgc-btn stgc-btn-quiet',
                type: 'button',
                title: '返回小游戏中心',
            });
            backBtn.innerHTML = '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i><span>游戏中心</span>';
            backBtn.addEventListener('click', () => openCenter());
            header.append(backBtn);
        } else {
            header.append(el('div', { class: 'stgc-title', text: title }));
        }

        const closeBtn = el('button', {
            class: 'stgc-btn stgc-btn-icon',
            type: 'button',
            title: '关闭',
            'aria-label': '关闭小游戏中心',
        });
        closeBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        closeBtn.addEventListener('click', closeCenter);
        header.append(closeBtn);

        return header;
    }

    function renderHome() {
        cleanupGame();
        const root = ensureRoot();
        root.innerHTML = '';

        const panel = el('section', { class: 'stgc-panel stgc-home-panel' });
        const header = buildHeader();
        const intro = el('div', { class: 'stgc-intro' });
        intro.append(
            el('div', { class: 'stgc-title stgc-home-title', text: '小游戏中心' }),
            el('div', {
                class: 'stgc-subtitle',
                text: '随手玩一局，不打扰聊天。界面跟随 SillyTavern 当前主题。',
            }),
        );

        const grid = el('div', { class: 'stgc-menu-grid' });
        const games = [
            { id: 'mines', icon: 'fa-bomb', name: '扫雷', desc: '经典扫雷 · 7档难度 · 数字点击展开' },
            { id: '2048', icon: 'fa-hashtag', name: '2048', desc: '方向键 / 滑动 · 自动保存' },
            { id: 'sokoban', icon: 'fa-box', name: '推箱子', desc: '11 个关卡 · 方向键 / WASD' },
            { id: 'sudoku', icon: 'fa-table-cells', name: '数独', desc: '9×9 数字逻辑 · 多种难度' },
        ];

        for (const game of games) {
            const card = el('button', {
                class: 'stgc-game-card',
                type: 'button',
                'aria-label': `打开${game.name}`,
            });
            card.innerHTML = `
                <span class="stgc-card-icon"><i class="fa-solid ${game.icon}" aria-hidden="true"></i></span>
                <span class="stgc-card-copy">
                    <span class="stgc-card-name">${game.name}</span>
                    <span class="stgc-card-desc">${game.desc}</span>
                </span>`;
            card.addEventListener('click', () => openGame(game.id));
            grid.append(card);
        }

        panel.append(header, intro, grid);
        root.append(panel);
    }

    function openGame(game) {
        cleanupGame();
        state.currentGame = game;

        const root = ensureRoot();
        root.innerHTML = '';

        const panel = el('section', { class: 'stgc-panel stgc-game-panel' });
        const titles = {
            mines: '扫雷',
            '2048': '2048',
            sokoban: '推箱子',
            sudoku: '数独',
        };
        panel.append(buildHeader({ back: true, title: titles[game] }));

        const body = el('div', { class: 'stgc-game-body' });
        panel.append(body);
        root.append(panel);

        if (game === 'mines') renderMinesweeper(body);
        else if (game === '2048') render2048(body);
        else if (game === 'sokoban') renderSokoban(body);
        else if (game === 'sudoku') renderSudoku(body);
    }

    /* ==================== Minesweeper ==================== */

    const MINES_DIFFICULTIES = {
        beginner: { name: '新手', size: 9, mines: 10 },
        easy: { name: '初级', size: 10, mines: 15 },
        normal: { name: '中级', size: 12, mines: 25 },
        hard: { name: '高级', size: 16, mines: 45 },
        expert: { name: '专家', size: 20, mines: 80 },
        master: { name: '大师', size: 24, mines: 125 },
        hell: { name: '地狱', size: 30, mines: 180 },
    };

    function createMinesweeper(difficulty = 'normal') {
        const config = MINES_DIFFICULTIES[difficulty] || MINES_DIFFICULTIES.normal;
        const cells = Array.from({ length: config.size * config.size }, () => ({
            mine: false,
            open: false,
            flag: false,
            count: 0,
        }));

        return {
            difficulty,
            size: config.size,
            mineCount: config.mines,
            cells,
            flags: 0,
            gameOver: false,
            won: false,
            mode: 'open',
            startedAt: null,
            time: 0,
            firstMove: true,
            minesPlaced: false,
        };
    }

    function minesNeighbors(s, index) {
        const result = [];
        const x = index % s.size;
        const y = Math.floor(index / s.size);
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < s.size && ny >= 0 && ny < s.size) {
                    result.push(ny * s.size + nx);
                }
            }
        }
        return result;
    }

    function minesPlace(s, firstIndex) {
        const protectedCells = new Set([firstIndex, ...minesNeighbors(s, firstIndex)]);
        const candidates = [];

        s.cells.forEach((cell, index) => {
            // 首次点击及其周围一圈不生成雷；已经插旗的格子也尽量保留为安全格。
            if (!protectedCells.has(index) && !cell.flag) candidates.push(index);
        });

        // 极端情况下（用户第一步前插了很多旗子），放宽“排除旗子”的限制，保证一定能生成完整棋盘。
        if (candidates.length < s.mineCount) {
            s.cells.forEach((cell, index) => {
                if (!protectedCells.has(index) && !candidates.includes(index)) {
                    candidates.push(index);
                }
            });
        }

        // Fisher-Yates shuffle
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        for (let i = 0; i < s.mineCount && i < candidates.length; i++) {
            s.cells[candidates[i]].mine = true;
        }

        for (let index = 0; index < s.cells.length; index++) {
            if (s.cells[index].mine) continue;
            const neighbors = minesNeighbors(s, index);
            s.cells[index].count = neighbors.reduce(
                (count, neighbor) => count + (s.cells[neighbor].mine ? 1 : 0),
                0,
            );
        }

        s.minesPlaced = true;
        s.firstMove = false;
        s.startedAt = Date.now();
    }

    function minesCheckWin(s) {
        const safeCells = s.cells.filter(item => !item.mine);
        if (safeCells.every(item => item.open)) {
            s.won = true;
            s.time = s.startedAt ? Math.floor((Date.now() - s.startedAt) / 1000) : 0;
        }
    }

    function minesReveal(index) {
        const s = state.mines;
        if (!s || s.gameOver || s.won) return;

        const cell = s.cells[index];
        if (cell.open || cell.flag) return;

        // 第一手才布雷，保证开局不会直接踩雷，并给点击位置周围留出空间。
        if (s.firstMove) minesPlace(s, index);

        cell.open = true;
        if (cell.mine) {
            s.gameOver = true;
            for (const item of s.cells) {
                if (item.mine) item.open = true;
            }
            s.time = s.startedAt ? Math.floor((Date.now() - s.startedAt) / 1000) : 0;
            return;
        }

        if (cell.count === 0) {
            for (const neighbor of minesNeighbors(s, index)) {
                if (!s.cells[neighbor].open && !s.cells[neighbor].flag) {
                    minesReveal(neighbor);
                }
            }
        }

        minesCheckWin(s);
    }

    function minesChord(index) {
        const s = state.mines;
        if (!s || s.gameOver || s.won || s.firstMove) return;

        const cell = s.cells[index];
        if (!cell.open || cell.count === 0) return;

        const neighbors = minesNeighbors(s, index);
        const flagCount = neighbors.filter(i => s.cells[i].flag).length;
        if (flagCount !== cell.count) return;

        for (const neighbor of neighbors) {
            const target = s.cells[neighbor];
            if (!target.open && !target.flag) minesReveal(neighbor);
        }
    }

    function minesToggleFlag(index) {
        const s = state.mines;
        if (!s || s.gameOver || s.won) return;

        const cell = s.cells[index];
        if (cell.open) return;
        if (!cell.flag && s.flags >= s.mineCount) return;

        cell.flag = !cell.flag;
        s.flags += cell.flag ? 1 : -1;
    }

    function renderMinesweeper(body) {
        state.mines = createMinesweeper('normal');

        const difficultyBar = el('div', { class: 'stgc-difficulty-bar' });
        const difficultyLabel = el('span', { class: 'stgc-difficulty-label', text: '难度' });
        difficultyBar.append(difficultyLabel);

        for (const [id, config] of Object.entries(MINES_DIFFICULTIES)) {
            const btn = el('button', {
                class: 'stgc-btn stgc-btn-quiet stgc-difficulty-btn',
                type: 'button',
                text: config.name,
            });
            btn.dataset.difficulty = id;
            btn.addEventListener('click', () => {
                state.mines = createMinesweeper(id);
                updateDifficultyButtons();
                draw();
            });
            difficultyBar.append(btn);
        }

        const head = el('div', { class: 'stgc-game-toolbar' });
        const info = el('div', { class: 'stgc-game-info' });
        const timer = el('span', { class: 'stgc-pill' });
        const mineCounter = el('span', { class: 'stgc-pill' });
        const modeBtn = el('button', { class: 'stgc-btn stgc-btn-quiet', type: 'button' });
        const resetBtn = el('button', { class: 'stgc-btn', type: 'button' });

        modeBtn.innerHTML = '<i class="fa-solid fa-flag" aria-hidden="true"></i><span>标记模式</span>';
        resetBtn.innerHTML = '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>重新开始</span>';

        // 原地重置：只换状态，不重新建立 UI。
        resetBtn.addEventListener('click', () => {
            state.mines = createMinesweeper(state.mines.difficulty);
            draw();
        });

        modeBtn.addEventListener('click', () => {
            state.mines.mode = state.mines.mode === 'open' ? 'flag' : 'open';
            updateToolbar();
        });

        const board = el('div', { class: 'mine-board', role: 'grid', 'aria-label': '扫雷棋盘' });
        const hint = el('div', {
            class: 'stgc-game-hint',
            text: '左键翻开 · 右键标记 · 已翻开的数字在旗子数正确时可再次点击展开 · 第一手不会踩雷',
        });

        info.append(timer, mineCounter);
        head.append(info, modeBtn, resetBtn);
        body.append(difficultyBar, head, board, hint);

        const tick = window.setInterval(() => {
            if (!state.mines || state.mines.gameOver || state.mines.won || !state.mines.startedAt) return;
            state.mines.time = Math.floor((Date.now() - state.mines.startedAt) / 1000);
            updateToolbar();
        }, 1000);

        const onContext = event => {
            if (!board.contains(event.target)) return;
            event.preventDefault();
        };
        board.addEventListener('contextmenu', onContext);

        const onKey = event => {
            if (state.currentGame !== 'mines' || !state.mines) return;
            if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                state.mines.mode = state.mines.mode === 'open' ? 'flag' : 'open';
                updateToolbar();
            }
        };
        document.addEventListener('keydown', onKey);

        state.cleanup = () => {
            window.clearInterval(tick);
            board.removeEventListener('contextmenu', onContext);
            document.removeEventListener('keydown', onKey);
        };

        function updateDifficultyButtons() {
            difficultyBar.querySelectorAll('.stgc-difficulty-btn').forEach(button => {
                button.classList.toggle('active', button.dataset.difficulty === state.mines.difficulty);
            });
        }

        function updateToolbar() {
            const s = state.mines;
            const status = s.gameOver ? '踩雷了' : s.won ? '通关啦' : '';
            timer.textContent = status ? `${status} · ${formatTime(s.time)}` : formatTime(s.time);
            mineCounter.textContent = `地雷 ${s.mineCount - s.flags}`;
            modeBtn.classList.toggle('active', s.mode === 'flag');
        }

        function draw() {
            const s = state.mines;
            board.innerHTML = '';
            board.style.gridTemplateColumns = `repeat(${s.size}, minmax(0, 1fr))`;
            board.dataset.size = String(s.size);

            s.cells.forEach((cell, index) => {
                const btn = el('button', {
                    class: `mine-cell${cell.open ? ' open' : ''}${cell.mine && cell.open ? ' mine' : ''}`,
                    type: 'button',
                    role: 'gridcell',
                });

                if (cell.flag && !cell.open) {
                    btn.innerHTML = '<i class="fa-solid fa-flag" aria-hidden="true"></i>';
                    btn.classList.add('flagged');
                    btn.setAttribute('aria-label', '已标记');
                } else if (cell.open && cell.mine) {
                    btn.innerHTML = '<i class="fa-solid fa-bomb" aria-hidden="true"></i>';
                } else if (cell.open && cell.count > 0) {
                    btn.textContent = String(cell.count);
                    btn.dataset.n = String(cell.count);
                }

                btn.addEventListener('contextmenu', event => {
                    event.preventDefault();
                    minesToggleFlag(index);
                    draw();
                });

                btn.addEventListener('click', () => {
                    const current = state.mines.cells[index];
                    if (state.mines.mode === 'flag') {
                        minesToggleFlag(index);
                    } else if (current.open && current.count > 0) {
                        minesChord(index);
                    } else {
                        minesReveal(index);
                    }
                    draw();
                });

                board.append(btn);
            });

            updateDifficultyButtons();
            updateToolbar();
        }

        updateDifficultyButtons();
        draw();
    }

    /* ==================== 2048 ==================== */

    const GAME2048_STORAGE_KEY = 'st-mini-game-center:2048';

    function new2048() {
        const game = {
            board: Array(16).fill(0),
            score: 0,
            over: false,
            won: false,
        };
        add2048Tile(game);
        add2048Tile(game);
        return game;
    }

    function load2048() {
        try {
            const raw = localStorage.getItem(GAME2048_STORAGE_KEY);
            if (!raw) return null;
            const saved = JSON.parse(raw);
            if (!saved || !Array.isArray(saved.board) || saved.board.length !== 16) return null;
            if (!saved.board.every(value => Number.isInteger(value) && value >= 0)) return null;
            if (!Number.isFinite(saved.score)) return null;
            return {
                board: saved.board.slice(),
                score: Number(saved.score),
                over: !!saved.over,
                won: !!saved.won,
            };
        } catch (error) {
            console.warn('[小游戏中心] 读取 2048 存档失败', error);
            return null;
        }
    }

    function save2048() {
        if (!state.game2048) return;
        try {
            localStorage.setItem(GAME2048_STORAGE_KEY, JSON.stringify(state.game2048));
        } catch (error) {
            console.warn('[小游戏中心] 保存 2048 存档失败', error);
        }
    }

    function clear2048Save() {
        try {
            localStorage.removeItem(GAME2048_STORAGE_KEY);
        } catch (error) {
            console.warn('[小游戏中心] 清除 2048 存档失败', error);
        }
    }

    function add2048Tile(game) {
        const empty = [];
        game.board.forEach((value, index) => {
            if (value === 0) empty.push(index);
        });
        if (!empty.length) return;
        const index = empty[Math.floor(Math.random() * empty.length)];
        game.board[index] = Math.random() < 0.9 ? 2 : 4;
    }

    function merge2048(line, game) {
        const values = line.filter(Boolean);
        const result = [];
        for (let i = 0; i < values.length; i++) {
            if (values[i] === values[i + 1]) {
                const merged = values[i] * 2;
                result.push(merged);
                game.score += merged;
                if (merged >= 2048) game.won = true;
                i++;
            } else {
                result.push(values[i]);
            }
        }
        while (result.length < 4) result.push(0);
        return result;
    }

    function canMove2048(game) {
        if (game.board.some(value => value === 0)) return true;
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                const i = y * 4 + x;
                if (x < 3 && game.board[i] === game.board[i + 1]) return true;
                if (y < 3 && game.board[i] === game.board[i + 4]) return true;
            }
        }
        return false;
    }

    function move2048(direction) {
        const game = state.game2048;
        if (!game || game.over) return false;

        const old = game.board.slice();

        if (direction === 'left' || direction === 'right') {
            for (let y = 0; y < 4; y++) {
                let line = game.board.slice(y * 4, y * 4 + 4);
                if (direction === 'right') line.reverse();
                line = merge2048(line, game);
                if (direction === 'right') line.reverse();
                game.board.splice(y * 4, 4, ...line);
            }
        } else {
            for (let x = 0; x < 4; x++) {
                let line = [game.board[x], game.board[x + 4], game.board[x + 8], game.board[x + 12]];
                if (direction === 'down') line.reverse();
                line = merge2048(line, game);
                if (direction === 'down') line.reverse();
                for (let y = 0; y < 4; y++) game.board[y * 4 + x] = line[y];
            }
        }

        const changed = game.board.some((value, index) => value !== old[index]);
        if (changed) add2048Tile(game);
        if (!canMove2048(game)) game.over = true;
        if (changed || game.over) save2048();
        return changed;
    }

    function render2048(body) {
        state.game2048 = load2048() || new2048();
        save2048();

        const toolbar = el('div', { class: 'stgc-game-toolbar' });
        const score = el('div', { class: 'stgc-game-info' });
        const scorePill = el('span', { class: 'stgc-pill' });
        const reset = el('button', { class: 'stgc-btn', type: 'button' });
        reset.innerHTML = '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>重新开始</span>';
        reset.addEventListener('click', () => {
            clear2048Save();
            state.game2048 = new2048();
            save2048();
            draw();
        });
        score.append(scorePill);
        toolbar.append(score, reset);

        const board = el('div', { class: 'board-2048', 'aria-label': '2048 棋盘' });
        const controls = el('div', { class: 'game-direction-controls stgc-2048-controls', 'aria-label': '2048 方向键' });
        const controlsData = [
            ['↑', 'up', '向上'],
            ['←', 'left', '向左'],
            ['↓', 'down', '向下'],
            ['→', 'right', '向右'],
        ];
        controlsData.forEach(([text, direction, label]) => {
            const btn = el('button', {
                class: 'stgc-btn game-direction-btn',
                type: 'button',
                title: label,
                'aria-label': label,
                text,
            });
            btn.addEventListener('click', () => {
                move2048(direction);
                draw();
            });
            controls.append(btn);
        });

        const hint = el('div', {
            class: 'stgc-game-hint',
            text: '电脑：点击方向键或键盘方向键 · 手机：点击方向键，也可以滑动棋盘 · 自动保存，刷新后继续当前局',
        });
        body.append(toolbar, board, controls, hint);

        let startX = 0;
        let startY = 0;
        const onKey = event => {
            if (state.currentGame !== '2048') return;
            const map = {
                ArrowLeft: 'left',
                ArrowRight: 'right',
                ArrowUp: 'up',
                ArrowDown: 'down',
            };
            const direction = map[event.key];
            if (!direction) return;
            // 使用捕获阶段 + stopPropagation，避免酒馆自己的快捷键/滚动逻辑抢走方向键。
            event.preventDefault();
            event.stopPropagation();
            move2048(direction);
            draw();
        };
        const onTouchStart = event => {
            const touch = event.changedTouches[0];
            startX = touch.clientX;
            startY = touch.clientY;
        };
        const onTouchEnd = event => {
            const touch = event.changedTouches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
            if (Math.abs(dx) > Math.abs(dy)) move2048(dx > 0 ? 'right' : 'left');
            else move2048(dy > 0 ? 'down' : 'up');
            draw();
        };

        document.addEventListener('keydown', onKey, true);
        board.addEventListener('touchstart', onTouchStart, { passive: true });
        board.addEventListener('touchend', onTouchEnd, { passive: true });
        state.cleanup = () => {
            document.removeEventListener('keydown', onKey, true);
            board.removeEventListener('touchstart', onTouchStart);
            board.removeEventListener('touchend', onTouchEnd);
        };

        function draw() {
            const game = state.game2048;
            board.innerHTML = '';
            const status = game.over ? '游戏结束' : game.won ? '已达 2048' : `分数 ${game.score}`;
            scorePill.textContent = status;
            game.board.forEach(value => {
                const cell = el('div', { class: 'tile-2048' });
                if (value) {
                    cell.textContent = String(value);
                    cell.dataset.v = String(value);
                }
                board.append(cell);
            });
        }

        draw();
    }

    /* ==================== Sudoku ==================== */

    const SUDOKU_LEVELS = {
        easy: { label: '简单', blanks: 38 },
        medium: { label: '中等', blanks: 48 },
        hard: { label: '困难', blanks: 55 },
    };

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function sudokuCandidates(board, index) {
        const row = Math.floor(index / 9);
        const col = index % 9;
        const used = new Set();

        for (let x = 0; x < 9; x++) used.add(board[row * 9 + x]);
        for (let y = 0; y < 9; y++) used.add(board[y * 9 + col]);

        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        for (let y = boxRow; y < boxRow + 3; y++) {
            for (let x = boxCol; x < boxCol + 3; x++) used.add(board[y * 9 + x]);
        }

        const candidates = [];
        for (let n = 1; n <= 9; n++) if (!used.has(n)) candidates.push(n);
        return shuffleArray(candidates);
    }

    function sudokuSolve(board, limit = 2) {
        let target = -1;
        let targetCandidates = null;

        for (let i = 0; i < 81; i++) {
            if (board[i] !== 0) continue;
            const candidates = sudokuCandidates(board, i);
            if (candidates.length === 0) return 0;
            if (!targetCandidates || candidates.length < targetCandidates.length) {
                target = i;
                targetCandidates = candidates;
                if (candidates.length === 1) break;
            }
        }

        if (target === -1) return 1;

        let count = 0;
        for (const value of targetCandidates) {
            board[target] = value;
            count += sudokuSolve(board, limit);
            if (count >= limit) {
                board[target] = 0;
                return count;
            }
        }
        board[target] = 0;
        return count;
    }

    function generateSudoku(level = 'medium') {
        const solution = Array(81).fill(0);

        // 用回溯生成一个完整合法棋盘。
        function fill(index = 0) {
            if (index >= 81) return true;
            const row = Math.floor(index / 9);
            const col = index % 9;
            const candidates = [];
            for (let n = 1; n <= 9; n++) {
                let ok = true;
                for (let x = 0; x < 9; x++) if (solution[row * 9 + x] === n) ok = false;
                for (let y = 0; y < 9; y++) if (solution[y * 9 + col] === n) ok = false;
                const br = Math.floor(row / 3) * 3;
                const bc = Math.floor(col / 3) * 3;
                for (let y = br; y < br + 3; y++) {
                    for (let x = bc; x < bc + 3; x++) if (solution[y * 9 + x] === n) ok = false;
                }
                if (ok) candidates.push(n);
            }
            shuffleArray(candidates);
            for (const n of candidates) {
                solution[index] = n;
                if (fill(index + 1)) return true;
            }
            solution[index] = 0;
            return false;
        }

        fill();
        const puzzle = solution.slice();
        const indices = shuffleArray(Array.from({ length: 81 }, (_, i) => i));
        let removed = 0;
        const target = SUDOKU_LEVELS[level]?.blanks ?? SUDOKU_LEVELS.medium.blanks;

        for (const index of indices) {
            if (removed >= target) break;
            const backup = puzzle[index];
            puzzle[index] = 0;

            const test = puzzle.slice();
            const solutions = sudokuSolve(test, 2);
            if (solutions === 1) removed++;
            else puzzle[index] = backup;
        }

        const fixed = puzzle.map(v => v !== 0);
        return {
            puzzle,
            solution,
            fixed,
            selected: -1,
            mistakes: 0,
            errors: Array(81).fill(false),
            complete: false,
            level,
            startedAt: Date.now(),
            time: 0,
        };
    }

    function sudokuHasConflict(game, index, value) {
        const row = Math.floor(index / 9);
        const col = index % 9;

        for (let x = 0; x < 9; x++) {
            const i = row * 9 + x;
            if (i !== index && game.puzzle[i] === value) return true;
        }

        for (let y = 0; y < 9; y++) {
            const i = y * 9 + col;
            if (i !== index && game.puzzle[i] === value) return true;
        }

        const br = Math.floor(row / 3) * 3;
        const bc = Math.floor(col / 3) * 3;
        for (let y = br; y < br + 3; y++) {
            for (let x = bc; x < bc + 3; x++) {
                const i = y * 9 + x;
                if (i !== index && game.puzzle[i] === value) return true;
            }
        }

        return false;
    }

    function sudokuSet(index, value) {
        const game = state.sudoku;
        if (!game || game.complete || game.fixed[index]) return false;

        game.errors[index] = false;

        if (value === 0) {
            game.puzzle[index] = 0;
            return true;
        }

        // 允许玩家填入数字，但真正的正确性必须以答案盘为准。
        // 这样即使数字当前不与周围冲突，填错答案也会立刻显示错误。
        const conflict = sudokuHasConflict(game, index, value);
        const correct = value === game.solution[index];

        game.puzzle[index] = value;

        if (!correct || conflict) {
            game.errors[index] = true;
            game.mistakes++;
        }

        game.complete = game.puzzle.every((v, i) => v === game.solution[i]);
        if (game.complete) {
            game.time = Math.floor((Date.now() - game.startedAt) / 1000);
        }
        return true;
    }

    function renderSudoku(body) {
        state.sudoku = generateSudoku('medium');

        const toolbar = el('div', { class: 'stgc-game-toolbar' });
        const info = el('div', { class: 'stgc-game-info' });
        const status = el('span', { class: 'stgc-pill' });
        const difficulty = el('select', { class: 'stgc-btn stgc-select', 'aria-label': '数独难度' });
        Object.entries(SUDOKU_LEVELS).forEach(([key, value]) => {
            const option = el('option', { value: key, text: value.label });
            if (key === state.sudoku.level) option.selected = true;
            difficulty.append(option);
        });
        difficulty.addEventListener('change', () => {
            state.sudoku = generateSudoku(difficulty.value);
            draw();
        });

        const reset = el('button', { class: 'stgc-btn', type: 'button' });
        reset.innerHTML = '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>重新开始</span>';
        reset.addEventListener('click', () => {
            // 原地重置：只换游戏数据，不重建 UI。
            state.sudoku = generateSudoku(difficulty.value);
            draw();
        });

        info.append(status);
        toolbar.append(info, difficulty, reset);

        const board = el('div', {
            class: 'sudoku-board',
            role: 'grid',
            'aria-label': '数独棋盘',
        });
        const keypad = el('div', { class: 'sudoku-keypad', 'aria-label': '数独数字键盘' });
        const hint = el('div', {
            class: 'stgc-game-hint',
            text: '点击格子后输入数字 · 红色表示填错 · 电脑可按 1–9 / Delete · 手机使用数字键盘',
        });

        for (let n = 1; n <= 9; n++) {
            const btn = el('button', { class: 'stgc-btn sudoku-key', type: 'button', text: String(n) });
            btn.addEventListener('click', () => {
                if (state.sudoku.selected >= 0) {
                    sudokuSet(state.sudoku.selected, n);
                    draw();
                }
            });
            keypad.append(btn);
        }

        const erase = el('button', { class: 'stgc-btn sudoku-key sudoku-erase', type: 'button' });
        erase.innerHTML = '<i class="fa-solid fa-eraser" aria-hidden="true"></i><span>擦除</span>';
        erase.addEventListener('click', () => {
            if (state.sudoku.selected >= 0) {
                sudokuSet(state.sudoku.selected, 0);
                draw();
            }
        });
        keypad.append(erase);

        body.append(toolbar, board, keypad, hint);

        const tick = window.setInterval(() => {
            const game = state.sudoku;
            if (!game || game.complete) return;
            game.time = Math.floor((Date.now() - game.startedAt) / 1000);
            updateToolbar();
        }, 1000);

        const onKey = event => {
            if (state.currentGame !== 'sudoku') return;
            if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;

            const key = event.key;
            if (/^[1-9]$/.test(key)) {
                event.preventDefault();
                if (state.sudoku.selected >= 0) {
                    sudokuSet(state.sudoku.selected, Number(key));
                    draw();
                }
            } else if (key === '0' || key === 'Backspace' || key === 'Delete') {
                event.preventDefault();
                if (state.sudoku.selected >= 0) {
                    sudokuSet(state.sudoku.selected, 0);
                    draw();
                }
            } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
                event.preventDefault();
                const current = state.sudoku.selected < 0 ? 0 : state.sudoku.selected;
                const row = Math.floor(current / 9);
                const col = current % 9;
                const dx = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
                const dy = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
                const nx = Math.max(0, Math.min(8, col + dx));
                const ny = Math.max(0, Math.min(8, row + dy));
                state.sudoku.selected = ny * 9 + nx;
                draw();
            }
        };
        document.addEventListener('keydown', onKey);
        state.cleanup = () => {
            window.clearInterval(tick);
            document.removeEventListener('keydown', onKey);
        };

        function updateToolbar() {
            const game = state.sudoku;
            status.textContent = game.complete
                ? `🎉 完成 · ${formatTime(game.time)}`
                : `时间 ${formatTime(game.time)} · 错误 ${game.mistakes}`;
        }

        function draw() {
            const game = state.sudoku;
            board.innerHTML = '';

            for (let index = 0; index < 81; index++) {
                const value = game.puzzle[index];
                const row = Math.floor(index / 9);
                const col = index % 9;
                const cell = el('div', {
                    class: 'sudoku-cell',
                    role: 'gridcell',
                    tabindex: '-1',
                    'aria-label': `第 ${row + 1} 行，第 ${col + 1} 列${value ? `，数字 ${value}` : '，空格'}`,
                });

                // 使用普通 div 而不是 button，彻底避开 SillyTavern/主题对 button 的全局伪元素和背景样式覆盖。
                if (game.fixed[index]) cell.classList.add('fixed');
                if (game.selected === index) cell.classList.add('selected');
                if (game.errors[index]) cell.classList.add('error');

                if (game.selected >= 0) {
                    const selectedRow = Math.floor(game.selected / 9);
                    const selectedCol = game.selected % 9;
                    if (row === selectedRow || col === selectedCol) cell.classList.add('related');
                    if (Math.floor(row / 3) === Math.floor(selectedRow / 3) && Math.floor(col / 3) === Math.floor(selectedCol / 3)) {
                        cell.classList.add('related');
                    }
                    const selectedValue = game.puzzle[game.selected];
                    if (value && selectedValue && value === selectedValue) cell.classList.add('same-number');
                }

                if (col === 2 || col === 5) cell.classList.add('box-right');
                if (row === 2 || row === 5) cell.classList.add('box-bottom');

                if (value) cell.textContent = String(value);
                cell.addEventListener('click', () => {
                    game.selected = index;
                    draw();
                });
                board.append(cell);
            }

            updateToolbar();
        }

        draw();
    }

    /* ==================== Sokoban ==================== */

    const SOKOBAN_LEVELS = [
        {
            name: '第 1 关 · 入门',
            rows: [
                '########',
                '#      #',
                '# .  $ #',
                '#  $$  #',
                '#  @ . #',
                '#      #',
                '# .    #',
                '########',
            ],
        },
        {
            name: '第 2 关',
            rows: [
                '########',
                '#. $   #',
                '#  $   #',
                '#    $ #',
                '#     .#',
                '#   .@ #',
                '#      #',
                '########',
            ],
        },
        {
            name: '第 3 关',
            rows: [
                '########',
                '#.     #',
                '#     ##',
                '# .   .#',
                '# $    #',
                '#$$    #',
                '# @ ## #',
                '########',
            ],
        },
        {
            name: '第 4 关',
            rows: [
                '########',
                '# #  @ #',
                '# .    #',
                '#    $.#',
                '#     $#',
                '#  #   #',
                '#  #  ##',
                '########',
            ],
        },
        {
            name: '第 5 关',
            rows: [
                '########',
                '#   #  #',
                '#      #',
                '#    @##',
                '#      #',
                '#.# $ ##',
                '#  $.  #',
                '########',
            ],
        },
        {
            name: '第 6 关',
            rows: [
                '########',
                '#     .#',
                '##   $ #',
                '#    $ #',
                '#.     #',
                '#      #',
                '# # @# #',
                '########',
            ],
        },
        {
            name: '第 7 关',
            rows: [
                '########',
                '#.  #  #',
                '# $ @ .#',
                '#      #',
                '#  #   #',
                '##  #$ #',
                '#     ##',
                '########',
            ],
        },
        {
            name: '第 8 关',
            rows: [
                '########',
                '#     .#',
                '#   $  #',
                '#   $  #',
                '#      #',
                '#  @   #',
                '#.     #',
                '########',
            ],
        },
        {
            name: '第 9 关',
            rows: [
                '########',
                '# .$   #',
                '#  # #@#',
                '#      #',
                '#    $ #',
                '#     ##',
                '#   .  #',
                '########',
            ],
        },
        {
            name: '第 10 关',
            rows: [
                '########',
                '##     #',
                '#. .   #',
                '# $@ # #',
                '## $  ##',
                '# #    #',
                '#      #',
                '########',
            ],
        },
        {
            name: '第 11 关',
            rows: [
                '########',
                '# .    #',
                '#      #',
                '#     .#',
                '#      #',
                '#  $ $ #',
                '# @    #',
                '########',
            ],
        },
    ];

    function newSokoban(levelIndex = 0) {
        const level = SOKOBAN_LEVELS[levelIndex] || SOKOBAN_LEVELS[0];
        const cells = level.rows.map(row => row.split(''));
        const targets = [];
        const boxes = [];
        let px = 0;
        let py = 0;

        for (let y = 0; y < cells.length; y++) {
            for (let x = 0; x < cells[y].length; x++) {
                const char = cells[y][x];
                if (char === '@') {
                    px = x;
                    py = y;
                    cells[y][x] = ' ';
                } else if (char === '$') {
                    boxes.push({ x, y });
                    cells[y][x] = ' ';
                } else if (char === '.') {
                    targets.push(`${x},${y}`);
                    cells[y][x] = ' ';
                } else if (char === '*') {
                    targets.push(`${x},${y}`);
                    boxes.push({ x, y });
                    cells[y][x] = ' ';
                }
            }
        }

        return {
            levelIndex,
            cells,
            px,
            py,
            boxes,
            targets,
            moves: 0,
            won: boxes.length > 0 && boxes.length === targets.length && boxes.every(box => targets.includes(`${box.x},${box.y}`)),
        };
    }

    function sokoBoxAt(game, x, y) {
        return game.boxes.find(box => box.x === x && box.y === y);
    }

    function sokoMove(dx, dy) {
        const game = state.sokoban;
        if (!game || game.won) return;

        const nx = game.px + dx;
        const ny = game.py + dy;
        if (game.cells[ny]?.[nx] === '#') return;

        const box = sokoBoxAt(game, nx, ny);
        if (box) {
            const bx = nx + dx;
            const by = ny + dy;
            if (game.cells[by]?.[bx] === '#' || sokoBoxAt(game, bx, by)) return;
            box.x = bx;
            box.y = by;
        }

        game.px = nx;
        game.py = ny;
        game.moves++;
        game.won = game.boxes.length === game.targets.length && game.boxes.every(box => game.targets.includes(`${box.x},${box.y}`));
    }

    function renderSokoban(body) {
        state.sokoban = newSokoban(0);

        const levelBar = el('div', { class: 'stgc-difficulty-bar stgc-level-bar' });
        const levelLabel = el('span', { class: 'stgc-difficulty-label', text: '关卡' });
        const levelSelect = el('select', { class: 'stgc-btn stgc-select stgc-level-select', 'aria-label': '推箱子关卡' });
        SOKOBAN_LEVELS.forEach((level, index) => {
            const option = el('option', { value: String(index), text: level.name });
            levelSelect.append(option);
        });
        levelSelect.addEventListener('change', () => {
            state.sokoban = newSokoban(Number(levelSelect.value));
            draw();
        });
        levelBar.append(levelLabel, levelSelect);

        const toolbar = el('div', { class: 'stgc-game-toolbar' });
        const info = el('div', { class: 'stgc-game-info' });
        const moves = el('span', { class: 'stgc-pill' });
        const reset = el('button', { class: 'stgc-btn', type: 'button' });
        const next = el('button', { class: 'stgc-btn', type: 'button' });
        reset.innerHTML = '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>重新开始</span>';
        next.innerHTML = '<i class="fa-solid fa-forward" aria-hidden="true"></i><span>下一关</span>';
        reset.addEventListener('click', () => {
            state.sokoban = newSokoban(state.sokoban.levelIndex);
            draw();
        });
        next.addEventListener('click', () => {
            const nextIndex = Math.min(SOKOBAN_LEVELS.length - 1, state.sokoban.levelIndex + 1);
            if (nextIndex !== state.sokoban.levelIndex) {
                state.sokoban = newSokoban(nextIndex);
                levelSelect.value = String(nextIndex);
                draw();
            }
        });
        info.append(moves);
        toolbar.append(info, reset, next);

        const board = el('div', { class: 'soko-board', 'aria-label': '推箱子棋盘' });
        const controls = el('div', { class: 'game-direction-controls soko-controls', 'aria-label': '推箱子方向键' });
        const hint = el('div', {
            class: 'stgc-game-hint',
            text: '电脑：点击方向键或键盘方向键 / WASD · 手机：点击方向键 · 可选择 11 个关卡',
        });

        const controlsData = [
            ['↑', 0, -1, '向上'],
            ['←', -1, 0, '向左'],
            ['↓', 0, 1, '向下'],
            ['→', 1, 0, '向右'],
        ];
        controlsData.forEach(([text, dx, dy, label]) => {
            const btn = el('button', {
                class: 'stgc-btn game-direction-btn soko-control',
                type: 'button',
                title: label,
                'aria-label': label,
                text,
            });
            btn.addEventListener('click', () => {
                sokoMove(dx, dy);
                draw();
            });
            controls.append(btn);
        });

        body.append(levelBar, toolbar, board, controls, hint);

        const onKey = event => {
            if (state.currentGame !== 'sokoban') return;
            const map = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
                a: [-1, 0],
                d: [1, 0],
                w: [0, -1],
                s: [0, 1],
            };
            const move = map[event.key];
            if (!move) return;
            event.preventDefault();
            event.stopPropagation();
            sokoMove(move[0], move[1]);
            draw();
        };
        document.addEventListener('keydown', onKey, true);
        state.cleanup = () => document.removeEventListener('keydown', onKey, true);

        function draw() {
            const game = state.sokoban;
            board.innerHTML = '';
            board.style.gridTemplateColumns = `repeat(${game.cells[0]?.length || 8}, minmax(0, 1fr))`;
            moves.textContent = game.won ? `通关 · ${game.moves} 步` : `${game.moves} 步`;
            next.disabled = !game.won || game.levelIndex >= SOKOBAN_LEVELS.length - 1;
            levelSelect.value = String(game.levelIndex);

            for (let y = 0; y < game.cells.length; y++) {
                for (let x = 0; x < game.cells[y].length; x++) {
                    const tile = el('div', { class: 'soko-tile' });
                    const target = game.targets.includes(`${x},${y}`);
                    const box = sokoBoxAt(game, x, y);

                    if (game.cells[y][x] === '#') tile.classList.add('wall');
                    if (target) tile.classList.add('target');
                    if (box) tile.classList.add(box && target ? 'done' : 'box');
                    if (game.px === x && game.py === y) tile.classList.add('player');

                    if (box) {
                        tile.innerHTML = box && target
                            ? '<i class="fa-solid fa-check" aria-hidden="true"></i>'
                            : '<i class="fa-solid fa-box" aria-hidden="true"></i>';
                    } else if (game.px === x && game.py === y) {
                        tile.innerHTML = '<i class="fa-solid fa-user" aria-hidden="true"></i>';
                    }
                    board.append(tile);
                }
            }
        }

        draw();
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

    function init() {
        injectLauncher();
        console.log('[小游戏中心] loaded');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
