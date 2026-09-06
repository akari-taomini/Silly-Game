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
            { id: 'mines', icon: 'fa-bomb', name: '扫雷', desc: '经典扫雷 · 右键标记 · 数字点击展开' },
            { id: '2048', icon: 'fa-hashtag', name: '2048', desc: '方向键 / 滑动合并数字' },
            { id: 'sokoban', icon: 'fa-box', name: '推箱子', desc: '把所有箱子推到目标点' },
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

    function createMinesweeper() {
        const size = 9;
        const mineCount = 10;
        const cells = Array.from({ length: size * size }, () => ({
            mine: false,
            open: false,
            flag: false,
            count: 0,
        }));

        let placed = 0;
        while (placed < mineCount) {
            const index = Math.floor(Math.random() * cells.length);
            if (!cells[index].mine) {
                cells[index].mine = true;
                placed++;
            }
        }

        for (let index = 0; index < cells.length; index++) {
            if (cells[index].mine) continue;
            const x = index % size;
            const y = Math.floor(index / size);
            let count = 0;

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
                    if (cells[ny * size + nx].mine) count++;
                }
            }
            cells[index].count = count;
        }

        return {
            size,
            mineCount,
            cells,
            flags: 0,
            gameOver: false,
            won: false,
            mode: 'open',
            startedAt: Date.now(),
            time: 0,
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

    function minesReveal(index) {
        const s = state.mines;
        if (!s || s.gameOver || s.won) return;

        const cell = s.cells[index];
        if (cell.open || cell.flag) return;

        cell.open = true;
        if (cell.mine) {
            s.gameOver = true;
            for (const item of s.cells) {
                if (item.mine) item.open = true;
            }
            return;
        }

        if (cell.count === 0) {
            for (const neighbor of minesNeighbors(s, index)) {
                if (!s.cells[neighbor].open && !s.cells[neighbor].flag) {
                    minesReveal(neighbor);
                }
            }
        }

        const safeCells = s.cells.filter(item => !item.mine);
        if (safeCells.every(item => item.open)) {
            s.won = true;
        }
    }

    function minesChord(index) {
        const s = state.mines;
        if (!s || s.gameOver || s.won) return;

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
        state.mines = createMinesweeper();

        const head = el('div', { class: 'stgc-game-toolbar' });
        const info = el('div', { class: 'stgc-game-info' });
        const timer = el('span', { class: 'stgc-pill' });
        const mineCounter = el('span', { class: 'stgc-pill' });
        const modeBtn = el('button', { class: 'stgc-btn stgc-btn-quiet', type: 'button' });
        const resetBtn = el('button', { class: 'stgc-btn', type: 'button' });

        modeBtn.innerHTML = '<i class="fa-solid fa-flag" aria-hidden="true"></i><span>标记模式</span>';
        resetBtn.innerHTML = '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>重新开始</span>';
        resetBtn.addEventListener('click', () => {
            // 原地重置：只替换状态，不重新创建任何 UI。
            state.mines = createMinesweeper();
            draw();
        });

        modeBtn.addEventListener('click', () => {
            state.mines.mode = state.mines.mode === 'open' ? 'flag' : 'open';
            updateToolbar();
        });

        const board = el('div', { class: 'mine-board', role: 'grid', 'aria-label': '扫雷棋盘' });
        const hint = el('div', {
            class: 'stgc-game-hint',
            text: '左键翻开 · 右键标记 · 已翻开的数字在旗子数正确时可再次点击展开',
        });

        info.append(timer, mineCounter);
        head.append(info, modeBtn, resetBtn);
        body.append(head, board, hint);

        const tick = window.setInterval(() => {
            if (!state.mines || state.mines.gameOver || state.mines.won) return;
            state.mines.time = Math.floor((Date.now() - state.mines.startedAt) / 1000);
            updateToolbar();
        }, 1000);

        const onContext = event => {
            if (!board.contains(event.target)) return;
            event.preventDefault();
        };
        board.addEventListener('contextmenu', onContext);

        state.cleanup = () => {
            window.clearInterval(tick);
            board.removeEventListener('contextmenu', onContext);
        };

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

            updateToolbar();
        }

        draw();
    }

    /* ==================== 2048 ==================== */

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
                if (merged === 2048) game.won = true;
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
        if (!game || game.over) return;

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
    }

    function render2048(body) {
        state.game2048 = new2048();

        const toolbar = el('div', { class: 'stgc-game-toolbar' });
        const score = el('div', { class: 'stgc-game-info' });
        const scorePill = el('span', { class: 'stgc-pill' });
        const reset = el('button', { class: 'stgc-btn', type: 'button' });
        reset.innerHTML = '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>重新开始</span>';
        reset.addEventListener('click', () => {
            state.game2048 = new2048();
            draw();
        });
        score.append(scorePill);
        toolbar.append(score, reset);

        const board = el('div', { class: 'board-2048', 'aria-label': '2048 棋盘' });
        const hint = el('div', {
            class: 'stgc-game-hint',
            text: '电脑：方向键 · 手机：在棋盘上滑动',
        });
        body.append(toolbar, board, hint);

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
            event.preventDefault();
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

        document.addEventListener('keydown', onKey);
        board.addEventListener('touchstart', onTouchStart, { passive: true });
        board.addEventListener('touchend', onTouchEnd, { passive: true });
        state.cleanup = () => {
            document.removeEventListener('keydown', onKey);
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
        if (!game || game.complete || game.fixed[index]) return;

        if (value !== 0 && sudokuHasConflict(game, index, value)) {
            game.mistakes++;
            return false;
        }

        game.puzzle[index] = value;
        game.complete = game.puzzle.every((v, i) => v === game.solution[i]);
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
            state.sudoku = generateSudoku(difficulty.value);
            draw();
        });

        info.append(status);
        toolbar.append(info, difficulty, reset);

        const board = el('div', { class: 'sudoku-board', role: 'grid', 'aria-label': '数独棋盘' });
        const keypad = el('div', { class: 'sudoku-keypad', 'aria-label': '数独数字键盘' });
        const hint = el('div', {
            class: 'stgc-game-hint',
            text: '点击格子后输入数字 · 电脑可直接按 1–9 / Delete · 手机使用数字键盘',
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
                const cell = el('button', {
                    class: 'sudoku-cell',
                    type: 'button',
                    role: 'gridcell',
                    'aria-label': `第 ${row + 1} 行，第 ${col + 1} 列${value ? `，数字 ${value}` : '，空格'}`,
                });

                if (game.fixed[index]) cell.classList.add('fixed');
                if (game.selected === index) cell.classList.add('selected');
                if (game.selected >= 0) {
                    const selectedRow = Math.floor(game.selected / 9);
                    const selectedCol = game.selected % 9;
                    if (row === selectedRow || col === selectedCol) cell.classList.add('related');
                    if (Math.floor(row / 3) === Math.floor(selectedRow / 3) && Math.floor(col / 3) === Math.floor(selectedCol / 3)) {
                        cell.classList.add('related');
                    }
                    if (value && value === game.puzzle[game.selected]) cell.classList.add('same-number');
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
                }
            }
        }

        return { cells, px, py, boxes, targets, moves: 0, won: false };
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
        game.won = game.boxes.every(box => game.targets.includes(`${box.x},${box.y}`));
    }

    function renderSokoban(body) {
        state.sokoban = newSokoban();

        const toolbar = el('div', { class: 'stgc-game-toolbar' });
        const info = el('div', { class: 'stgc-game-info' });
        const moves = el('span', { class: 'stgc-pill' });
        const reset = el('button', { class: 'stgc-btn', type: 'button' });
        reset.innerHTML = '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>重新开始</span>';
        reset.addEventListener('click', () => {
            state.sokoban = newSokoban();
            draw();
        });
        info.append(moves);
        toolbar.append(info, reset);

        const board = el('div', { class: 'soko-board', 'aria-label': '推箱子棋盘' });
        const controls = el('div', { class: 'soko-controls' });
        const hint = el('div', {
            class: 'stgc-game-hint',
            text: '电脑：方向键 / WASD · 手机：点击方向按钮',
        });

        const controlsData = [
            ['↑', 0, -1, '向上'],
            ['←', -1, 0, '向左'],
            ['↓', 0, 1, '向下'],
            ['→', 1, 0, '向右'],
        ];
        controlsData.forEach(([text, dx, dy, label]) => {
            const btn = el('button', {
                class: 'stgc-btn soko-control',
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

        body.append(toolbar, board, controls, hint);

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
            sokoMove(move[0], move[1]);
            draw();
        };
        document.addEventListener('keydown', onKey);
        state.cleanup = () => document.removeEventListener('keydown', onKey);

        function draw() {
            const game = state.sokoban;
            board.innerHTML = '';
            moves.textContent = game.won ? `通关 · ${game.moves} 步` : `步数 ${game.moves}`;

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
