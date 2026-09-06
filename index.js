(() => {
    'use strict';

    const APP_ID = 'st-mini-game-center';
    const LAUNCHER_POSITION_KEY = 'stgc-launcher-position-v1';
    const LAUNCHER_HIDDEN_KEY = 'stgc-launcher-hidden-v1';

    const state = {
        currentGame: null,
        cleanup: null,
        mines: null,
        game2048: null,
        sokoban: null,
        sudoku: null,
        spider: null,
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

    function getViewportSize() {
        return {
            width: Math.max(window.innerWidth || 360, 240),
            height: Math.max(window.innerHeight || 640, 240),
        };
    }

    function getLauncherSize() {
        const launcher = document.getElementById(`${APP_ID}-launcher`);
        if (!launcher) return { width: 48, height: 48 };
        const rect = launcher.getBoundingClientRect();
        return {
            width: Math.max(rect.width || 48, 48),
            height: Math.max(rect.height || 48, 48),
        };
    }

    function clampLauncherPosition(x, y) {
        const viewport = getViewportSize();
        const size = getLauncherSize();
        const margin = 8;
        return {
            x: Math.min(Math.max(x, margin), Math.max(margin, viewport.width - size.width - margin)),
            y: Math.min(Math.max(y, margin), Math.max(margin, viewport.height - size.height - margin)),
        };
    }

    function getStoredLauncherPosition() {
        try {
            const raw = localStorage.getItem(LAUNCHER_POSITION_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!Number.isFinite(parsed?.x) || !Number.isFinite(parsed?.y)) return null;
            return { x: parsed.x, y: parsed.y };
        } catch {
            return null;
        }
    }

    function setLauncherPosition(x, y, save = true) {
        const launcher = document.getElementById(`${APP_ID}-launcher`);
        if (!launcher) return;
        const position = clampLauncherPosition(x, y);
        launcher.style.left = `${position.x}px`;
        launcher.style.top = `${position.y}px`;
        launcher.style.right = 'auto';
        launcher.style.bottom = 'auto';
        if (save) {
            try {
                localStorage.setItem(LAUNCHER_POSITION_KEY, JSON.stringify(position));
            } catch { /* localStorage unavailable: position still works for this session */ }
        }
    }

    function resetLauncherPosition() {
        const viewport = getViewportSize();
        const size = getLauncherSize();
        setLauncherPosition(
            viewport.width - size.width - 18,
            viewport.height - size.height - 118,
        );
    }

    function isLauncherHidden() {
        try {
            return localStorage.getItem(LAUNCHER_HIDDEN_KEY) === '1';
        } catch {
            return false;
        }
    }

    function setLauncherHidden(hidden) {
        const launcher = document.getElementById(`${APP_ID}-launcher`);
        if (!launcher) return;
        launcher.classList.toggle('is-hidden', hidden);
        launcher.setAttribute('aria-hidden', hidden ? 'true' : 'false');
        launcher.tabIndex = hidden ? -1 : 0;
        const restore = document.getElementById(`${APP_ID}-restore`);
        if (restore) restore.classList.toggle('show', hidden);
        try {
            localStorage.setItem(LAUNCHER_HIDDEN_KEY, hidden ? '1' : '0');
        } catch { /* ignore */ }
    }

    function toggleLauncherHidden() {
        setLauncherHidden(!isLauncherHidden());
    }

    function injectLauncher() {
        if (document.getElementById(`${APP_ID}-launcher`)) return;

        const launcher = el('div', {
            id: `${APP_ID}-launcher`,
            class: 'stgc-launcher',
            role: 'button',
            tabindex: '0',
            title: 'Silly Game',
            'aria-label': '打开 Silly Game',
        });
        launcher.innerHTML = '<svg class="stgc-launcher-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h10a4 4 0 0 1 3.8 2.8l1.1 4a3 3 0 0 1-5.7 1.8L15 14H9l-1.2 2.6a3 3 0 0 1-5.7-1.8l1.1-4A4 4 0 0 1 7 8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 10.5v4M6 12.5h4M16.5 11.5h.01M19 14h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

        let drag = null;
        launcher.addEventListener('pointerdown', event => {
            if (event.button !== undefined && event.button !== 0) return;
            const rect = launcher.getBoundingClientRect();
            drag = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                originX: rect.left,
                originY: rect.top,
                moved: false,
            };
            launcher.setPointerCapture?.(event.pointerId);
        });

        launcher.addEventListener('pointermove', event => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;
            if (!drag.moved && Math.hypot(dx, dy) < 6) return;
            drag.moved = true;
            setLauncherPosition(drag.originX + dx, drag.originY + dy, false);
            event.preventDefault();
        });

        const endDrag = event => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            const wasMoved = drag.moved;
            drag = null;
            if (wasMoved) {
                const rect = launcher.getBoundingClientRect();
                setLauncherPosition(rect.left, rect.top, true);
                event.preventDefault();
                return;
            }
            openCenter();
        };

        launcher.addEventListener('pointerup', endDrag);
        launcher.addEventListener('pointercancel', event => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            drag = null;
        });
        launcher.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openCenter();
            }
        });

        const restore = el('div', {
            id: `${APP_ID}-restore`,
            class: 'stgc-restore-handle',
            role: 'button',
            tabindex: '0',
            title: '显示 Silly Game 悬浮按钮',
            'aria-label': '显示 Silly Game 悬浮按钮',
            text: 'S',
        });
        restore.addEventListener('click', () => setLauncherHidden(false));
        restore.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setLauncherHidden(false);
            }
        });
        document.body.append(launcher, restore);

        const stored = getStoredLauncherPosition();
        if (stored) setLauncherPosition(stored.x, stored.y, false);
        else {
            // Wait one frame so the launcher has a measurable size.
            requestAnimationFrame(resetLauncherPosition);
        }
        setLauncherHidden(isLauncherHidden());
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
        document.getElementById(`${APP_ID}-launcher`)?.classList.add('in-use');
        root.classList.add('show');
        root.setAttribute('aria-hidden', 'false');
        renderHome();
    }

    function closeCenter() {
        cleanupGame();
        const root = document.getElementById(APP_ID);
        if (!root) return;
        root.classList.remove('show');
        document.getElementById(`${APP_ID}-launcher`)?.classList.remove('in-use');
        root.setAttribute('aria-hidden', 'true');
        state.currentGame = null;
    }

    function buildHeader({ back = false, title = 'Silly Game', settings = false } = {}) {
        const header = el('header', { class: 'stgc-header' });

        if (back) {
            const backBtn = el('button', {
                class: 'stgc-btn stgc-btn-quiet',
                type: 'button',
                title: '返回 Silly Game',
            });
            backBtn.innerHTML = '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i><span>Silly Game</span>';
            backBtn.addEventListener('click', () => openCenter());
            header.append(backBtn);
        } else {
            header.append(el('div', { class: 'stgc-title', text: title }));
        }

        if (settings) {
            const settingsBtn = el('button', {
                class: 'stgc-btn stgc-btn-icon stgc-header-settings',
                type: 'button',
                title: '悬浮按钮设置',
                'aria-label': '悬浮按钮设置',
            });
            settingsBtn.innerHTML = '<i class="fa-solid fa-gear" aria-hidden="true"></i>';
            settingsBtn.addEventListener('click', showLauncherSettings);
            header.append(settingsBtn);
        }

        const closeBtn = el('button', {
            class: 'stgc-btn stgc-btn-icon',
            type: 'button',
            title: '关闭',
            'aria-label': '关闭 Silly Game',
        });
        closeBtn.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
        closeBtn.addEventListener('click', closeCenter);
        header.append(closeBtn);

        return header;
    }

    function showLauncherSettings() {
        const root = ensureRoot();
        const existing = root.querySelector('.stgc-settings-dialog');
        if (existing) {
            existing.remove();
            return;
        }

        const dialog = el('div', { class: 'stgc-settings-dialog', role: 'dialog', 'aria-label': 'Silly Game 悬浮按钮设置' });
        const box = el('div', { class: 'stgc-settings-box' });
        const header = el('div', { class: 'stgc-settings-header' });
        header.append(
            el('div', { class: 'stgc-title', text: '悬浮按钮' }),
            el('button', { class: 'stgc-btn stgc-btn-icon', type: 'button', text: '×', title: '关闭设置' }),
        );
        header.lastChild.addEventListener('click', () => dialog.remove());

        const currentHidden = isLauncherHidden();
        const row = el('div', { class: 'stgc-setting-row' });
        const copy = el('div', { class: 'stgc-setting-copy' });
        copy.append(
            el('div', { class: 'stgc-setting-name', text: '隐藏悬浮按钮' }),
            el('div', { class: 'stgc-setting-desc', text: '隐藏后会收成屏幕边缘的小把手；电脑也可用 Alt + G 恢复。' }),
        );
        const toggle = el('button', {
            class: `stgc-btn stgc-toggle ${currentHidden ? 'active' : ''}`,
            type: 'button',
            text: currentHidden ? '已隐藏' : '显示中',
        });
        toggle.addEventListener('click', () => {
            const hidden = !isLauncherHidden();
            setLauncherHidden(hidden);
            toggle.classList.toggle('active', hidden);
            toggle.textContent = hidden ? '已隐藏' : '显示中';
        });
        row.append(copy, toggle);

        const reset = el('button', { class: 'stgc-btn', type: 'button' });
        reset.innerHTML = '<i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i><span>恢复悬浮按钮默认位置</span>';
        reset.addEventListener('click', resetLauncherPosition);

        const shortcut = el('div', { class: 'stgc-setting-note', text: '提示：悬浮按钮可以直接拖到任意位置，手机和电脑都支持；位置会自动记住。' });
        box.append(header, row, reset, shortcut);
        dialog.append(box);
        dialog.addEventListener('click', event => {
            if (event.target === dialog) dialog.remove();
        });
        root.append(dialog);
    }

    function renderHome() {
        cleanupGame();
        const root = ensureRoot();
        root.innerHTML = '';

        const panel = el('section', { class: 'stgc-panel stgc-home-panel' });
        const header = buildHeader({ title: 'Silly Game', settings: true });
        const intro = el('div', { class: 'stgc-intro' });
        intro.append(
            el('div', { class: 'stgc-title stgc-home-title', text: 'Silly Game' }),
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
            { id: 'spider', icon: 'fa-spider', name: '蜘蛛纸牌', desc: '1 / 2 / 4 花色 · 撤销与提示' },
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
            spider: '蜘蛛纸牌',
        };
        panel.append(buildHeader({ back: true, title: titles[game] }));

        const body = el('div', { class: 'stgc-game-body' });
        panel.append(body);
        root.append(panel);

        if (game === 'mines') renderMinesweeper(body);
        else if (game === '2048') render2048(body);
        else if (game === 'sokoban') renderSokoban(body);
        else if (game === 'sudoku') renderSudoku(body);
        else if (game === 'spider') renderSpider(body);
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

        // 扫雷视野：棋盘本体可以放大，外层视口只显示局部；
        // 上下左右按钮每次移动一格，方便手机微调视野。
        let mineZoom = window.innerWidth <= 640 ? 1.35 : 1;
        let mineCellSize = 32;

        function getMineCellSize(size) {
            if (size >= 24) return 24;
            if (size >= 20) return 26;
            if (size >= 16) return 28;
            return 32;
        }

        function getMineMaxZoom(size) {
            if (size >= 24) return 2.25;
            if (size >= 20) return 2.5;
            return 3;
        }

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
                mineZoom = window.innerWidth <= 640 ? 1.35 : 1;
                updateDifficultyButtons();
                draw();
                centerMineView();
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
            mineZoom = window.innerWidth <= 640 ? 1.35 : 1;
            draw();
            centerMineView();
        });

        modeBtn.addEventListener('click', () => {
            state.mines.mode = state.mines.mode === 'open' ? 'flag' : 'open';
            updateToolbar();
        });

        const mineViewport = el('div', { class: 'mine-viewport', role: 'region', 'aria-label': '扫雷可视区域' });
        const board = el('div', { class: 'mine-board', role: 'grid', 'aria-label': '扫雷棋盘' });
        mineViewport.append(board);

        const mineViewTools = el('div', { class: 'mine-view-tools' });
        const zoomMinus = el('button', { class: 'stgc-btn stgc-btn-icon', type: 'button', text: '−', title: '缩小视野' });
        const zoomText = el('span', { class: 'stgc-pill mine-zoom-text' });
        const zoomPlus = el('button', { class: 'stgc-btn stgc-btn-icon', type: 'button', text: '+', title: '放大视野' });
        const zoomReset = el('button', { class: 'stgc-btn stgc-btn-quiet', type: 'button', text: '回到中心', title: '回到棋盘中心' });
        mineViewTools.append(zoomMinus, zoomText, zoomPlus, zoomReset);

        const minePan = el('div', { class: 'mine-pan-controls', 'aria-label': '微调扫雷视野' });
        const panUp = el('button', { class: 'stgc-btn game-direction-btn', type: 'button', text: '↑', title: '视野向上' });
        const panLeft = el('button', { class: 'stgc-btn game-direction-btn', type: 'button', text: '←', title: '视野向左' });
        const panDown = el('button', { class: 'stgc-btn game-direction-btn', type: 'button', text: '↓', title: '视野向下' });
        const panRight = el('button', { class: 'stgc-btn game-direction-btn', type: 'button', text: '→', title: '视野向右' });
        minePan.append(panUp, panLeft, panDown, panRight);

        const hint = el('div', {
            class: 'stgc-game-hint',
            text: '棋盘可放大查看局部 · 上下左右按钮每次微调一格 · 左键翻开 · 右键标记 · 数字可再次点击展开',
        });

        info.append(timer, mineCounter);
        head.append(info, modeBtn, resetBtn);
        body.append(difficultyBar, head, mineViewTools, mineViewport, minePan, hint);

        function mineStep() {
            return Math.max(12, Math.round(mineCellSize * 0.95));
        }

        function scrollMineView(dx, dy) {
            mineViewport.scrollBy({ left: dx * mineStep(), top: dy * mineStep(), behavior: 'smooth' });
        }

        function centerMineView() {
            const maxLeft = Math.max(0, mineViewport.scrollWidth - mineViewport.clientWidth);
            const maxTop = Math.max(0, mineViewport.scrollHeight - mineViewport.clientHeight);
            mineViewport.scrollTo({ left: maxLeft / 2, top: maxTop / 2, behavior: 'smooth' });
        }

        function setMineZoom(nextZoom, keepCenter = true) {
            const s = state.mines;
            const oldZoom = mineZoom;
            const maxZoom = getMineMaxZoom(s.size);
            mineZoom = Math.max(0.9, Math.min(maxZoom, Math.round(nextZoom * 20) / 20));

            if (mineZoom === oldZoom) return;

            const centerX = mineViewport.scrollLeft + mineViewport.clientWidth / 2;
            const centerY = mineViewport.scrollTop + mineViewport.clientHeight / 2;
            const ratio = mineZoom / oldZoom;
            draw();

            if (keepCenter) {
                mineViewport.scrollLeft = Math.max(0, centerX * ratio - mineViewport.clientWidth / 2);
                mineViewport.scrollTop = Math.max(0, centerY * ratio - mineViewport.clientHeight / 2);
            }
        }

        zoomMinus.addEventListener('click', () => setMineZoom(mineZoom - 0.25));
        zoomPlus.addEventListener('click', () => setMineZoom(mineZoom + 0.25));
        zoomReset.addEventListener('click', centerMineView);
        panUp.addEventListener('click', () => scrollMineView(0, -1));
        panLeft.addEventListener('click', () => scrollMineView(-1, 0));
        panDown.addEventListener('click', () => scrollMineView(0, 1));
        panRight.addEventListener('click', () => scrollMineView(1, 0));

        const onMineViewKey = event => {
            if (state.currentGame !== 'mines' || !state.mines) return;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            const keyMoves = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
            const move = keyMoves[event.key];
            if (!move) return;
            event.preventDefault();
            scrollMineView(...move);
        };
        document.addEventListener('keydown', onMineViewKey, true);

        const tick = window.setInterval(() => {
            if (!state.mines || state.mines.gameOver || state.mines.won || !state.mines.startedAt) return;
            state.mines.time = Math.floor((Date.now() - state.mines.startedAt) / 1000);
            updateToolbar();
        }, 1000);

        // 手机上的长按可能同时触发 contextmenu + click，导致标记一次又被取消。
        // 只让桌面右键承担“快速标记”，触屏一律交给“标记模式”处理。
        let lastTouchAt = 0;
        const onPointerDown = event => {
            if (event.pointerType === 'touch') lastTouchAt = Date.now();
        };
        const onContext = event => {
            const cellElement = event.target.closest?.('.mine-cell');
            if (!cellElement || !board.contains(cellElement)) return;
            event.preventDefault();
            if (Date.now() - lastTouchAt < 800) return;
            minesToggleFlag(Number(cellElement.dataset.index));
            draw();
        };
        board.addEventListener('pointerdown', onPointerDown);
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
            board.removeEventListener('pointerdown', onPointerDown);
            board.removeEventListener('contextmenu', onContext);
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('keydown', onMineViewKey, true);
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
            board.classList.toggle('flag-mode', s.mode === 'flag');
            modeBtn.innerHTML = s.mode === 'flag'
                ? '<i class="fa-solid fa-flag" aria-hidden="true"></i><span>标记模式：开</span>'
                : '<i class="fa-solid fa-flag" aria-hidden="true"></i><span>标记模式：关</span>';
        }

        function draw() {
            const s = state.mines;
            board.innerHTML = '';
            mineCellSize = Math.max(20, Math.round(getMineCellSize(s.size) * mineZoom));
            board.style.gridTemplateColumns = `repeat(${s.size}, ${mineCellSize}px)`;
            board.style.gridTemplateRows = `repeat(${s.size}, ${mineCellSize}px)`;
            board.style.width = `${s.size * mineCellSize}px`;
            board.style.height = `${s.size * mineCellSize}px`;
            board.dataset.size = String(s.size);
            mineViewport.dataset.size = String(s.size);
            zoomText.textContent = `${Math.round(mineZoom * 100)}%`;

            s.cells.forEach((cell, index) => {
                const btn = el('button', {
                    class: `mine-cell${cell.open ? ' open' : ''}${cell.mine && cell.open ? ' mine' : ''}`,
                    type: 'button',
                    role: 'gridcell',
                });
                btn.dataset.index = String(index);

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
        // 初次打开也从棋盘中心开始，尤其适合大师/地狱难度。
        requestAnimationFrame(centerMineView);
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
            console.warn('[Silly Game] 读取 2048 存档失败', error);
            return null;
        }
    }

    function save2048() {
        if (!state.game2048) return;
        try {
            localStorage.setItem(GAME2048_STORAGE_KEY, JSON.stringify(state.game2048));
        } catch (error) {
            console.warn('[Silly Game] 保存 2048 存档失败', error);
        }
    }

    function clear2048Save() {
        try {
            localStorage.removeItem(GAME2048_STORAGE_KEY);
        } catch (error) {
            console.warn('[Silly Game] 清除 2048 存档失败', error);
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


    /* ==================== Spider Solitaire ==================== */

    const SPIDER_LEVELS = {
        one: { label: '1 花色', suits: ['♠'], suitCount: 1 },
        two: { label: '2 花色', suits: ['♠', '♥'], suitCount: 2 },
        four: { label: '4 花色', suits: ['♠', '♥', '♣', '♦'], suitCount: 4 },
    };

    function spiderShuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function spiderBuildDeck(levelKey = 'one') {
        const level = SPIDER_LEVELS[levelKey] || SPIDER_LEVELS.one;
        const copies = 8 / level.suitCount;
        const deck = [];
        let id = 0;
        for (const suit of level.suits) {
            for (let copy = 0; copy < copies; copy++) {
                for (let rank = 1; rank <= 13; rank++) {
                    deck.push({ id: id++, suit, rank, faceUp: false });
                }
            }
        }
        return spiderShuffle(deck);
    }

    function newSpiderGame(levelKey = 'one') {
        const level = SPIDER_LEVELS[levelKey] || SPIDER_LEVELS.one;
        const deck = spiderBuildDeck(levelKey);
        const tableau = Array.from({ length: 10 }, () => []);

        // 104 张牌：前 4 列各 6 张，其余 6 列各 5 张，共 54 张入台面；剩余 50 张入发牌堆。
        for (let col = 0; col < 10; col++) {
            const count = col < 4 ? 6 : 5;
            for (let i = 0; i < count; i++) {
                const card = deck.pop();
                card.faceUp = i === count - 1;
                tableau[col].push(card);
            }
        }

        return {
            level: levelKey,
            tableau,
            stock: deck,
            completed: 0,
            moves: 0,
            score: 500,
            mistakes: 0,
            selected: null,
            hint: null,
            startedAt: Date.now(),
            time: 0,
            won: false,
            history: [],
            message: '',
        };
    }

    function spiderSnapshot(game) {
        return JSON.stringify({
            tableau: game.tableau,
            stock: game.stock,
            completed: game.completed,
            moves: game.moves,
            score: game.score,
            mistakes: game.mistakes,
            time: game.time,
            won: game.won,
        });
    }

    function spiderSaveHistory(game) {
        game.history.push(spiderSnapshot(game));
        if (game.history.length > 60) game.history.shift();
        game.selected = null;
        game.hint = null;
    }

    function spiderUndo() {
        const game = state.spider;
        if (!game || !game.history.length) return false;
        const raw = game.history.pop();
        const restored = JSON.parse(raw);
        Object.assign(game, restored, { selected: null, hint: null });
        return true;
    }

    function spiderFindCard(game, column, index) {
        return game.tableau[column]?.[index] || null;
    }

    function spiderCanMoveSequence(game, column, index) {
        const pile = game.tableau[column];
        if (!pile || index < 0 || index >= pile.length) return false;
        const first = pile[index];
        if (!first.faceUp) return false;
        for (let i = index; i < pile.length - 1; i++) {
            const a = pile[i];
            const b = pile[i + 1];
            if (!b.faceUp || b.suit !== a.suit || b.rank !== a.rank - 1) return false;
        }
        return true;
    }

    function spiderGetMoveLength(game, column, index) {
        if (!spiderCanMoveSequence(game, column, index)) return 0;
        return game.tableau[column].length - index;
    }

    function spiderCanPlace(game, fromColumn, index, toColumn) {
        if (fromColumn === toColumn) return false;
        const source = game.tableau[fromColumn];
        const target = game.tableau[toColumn];
        if (!source || !target || index < 0 || index >= source.length) return false;
        if (!spiderCanMoveSequence(game, fromColumn, index)) return false;
        if (target.length === 0) return true;
        const moving = source[index];
        const top = target[target.length - 1];
        return top.faceUp && top.rank === moving.rank + 1;
    }

    function spiderRevealTop(game, column) {
        const pile = game.tableau[column];
        const top = pile[pile.length - 1];
        if (top && !top.faceUp) top.faceUp = true;
    }

    function spiderCheckCompleted(game, column) {
        const pile = game.tableau[column];
        if (pile.length < 13) return false;
        const start = pile.length - 13;
        const sequence = pile.slice(start);
        if (!sequence.every(card => card.faceUp)) return false;
        const suit = sequence[0].suit;
        for (let i = 0; i < 13; i++) {
            if (sequence[i].suit !== suit || sequence[i].rank !== 13 - i) return false;
        }
        pile.splice(start, 13);
        game.completed++;
        game.score += 100;
        spiderRevealTop(game, column);
        return true;
    }

    function spiderMove(fromColumn, index, toColumn) {
        const game = state.spider;
        if (!game || game.won) return false;
        if (!spiderCanPlace(game, fromColumn, index, toColumn)) return false;

        spiderSaveHistory(game);
        const source = game.tableau[fromColumn];
        const moved = source.splice(index);
        game.tableau[toColumn].push(...moved);
        spiderRevealTop(game, fromColumn);
        game.moves++;
        game.score = Math.max(0, game.score - 1);
        spiderCheckCompleted(game, toColumn);
        game.won = game.completed >= 8;
        if (game.won) game.time = Math.floor((Date.now() - game.startedAt) / 1000);
        return true;
    }

    function spiderDealStock() {
        const game = state.spider;
        if (!game || game.won) return false;
        if (!game.stock.length) {
            game.message = '发牌堆已经没有牌了。';
            return false;
        }
        if (game.tableau.some(pile => pile.length === 0)) {
            game.message = '存在空列，必须先把空列填上才能发牌。';
            return false;
        }

        spiderSaveHistory(game);
        for (let col = 0; col < 10; col++) {
            const card = game.stock.pop();
            if (!card) break;
            card.faceUp = true;
            game.tableau[col].push(card);
        }
        game.moves++;
        game.score = Math.max(0, game.score - 10);
        game.message = '';
        for (let col = 0; col < 10; col++) spiderCheckCompleted(game, col);
        game.won = game.completed >= 8;
        if (game.won) game.time = Math.floor((Date.now() - game.startedAt) / 1000);
        return true;
    }

    function spiderClickCard(column, index) {
        const game = state.spider;
        if (!game || game.won) return;
        game.message = '';
        const card = spiderFindCard(game, column, index);
        if (!card?.faceUp) return;

        if (!game.selected) {
            if (!spiderCanMoveSequence(game, column, index)) {
                game.message = '这组牌必须同花色连续排列，才能整组移动。';
                return;
            }
            game.selected = { column, index };
            return;
        }

        if (game.selected.column === column && game.selected.index === index) {
            game.selected = null;
            return;
        }

        const selected = game.selected;
        if (spiderMove(selected.column, selected.index, column)) {
            game.selected = null;
        } else if (spiderCanMoveSequence(game, column, index)) {
            game.selected = { column, index };
        } else {
            game.message = '这里放不了这组牌。';
        }
    }

    function spiderFindHint(game) {
        for (let from = 0; from < 10; from++) {
            const pile = game.tableau[from];
            for (let i = 0; i < pile.length; i++) {
                if (!spiderCanMoveSequence(game, from, i)) continue;
                for (let to = 0; to < 10; to++) {
                    if (spiderCanPlace(game, from, i, to)) {
                        return { from, index: i, to };
                    }
                }
            }
        }
        if (game.stock.length) return { stock: true };
        return null;
    }

    function renderSpider(body) {
        state.spider = newSpiderGame('one');
        const game = state.spider;

        const difficultyBar = el('div', { class: 'stgc-difficulty-bar spider-level-bar' });
        const difficultyLabel = el('span', { class: 'stgc-difficulty-label', text: '模式' });
        const levelSelect = el('select', { class: 'stgc-btn stgc-select', 'aria-label': '蜘蛛纸牌模式' });
        Object.entries(SPIDER_LEVELS).forEach(([key, value]) => {
            const option = el('option', { value: key, text: value.label });
            levelSelect.append(option);
        });
        levelSelect.addEventListener('change', () => {
            state.spider = newSpiderGame(levelSelect.value);
            draw();
        });
        difficultyBar.append(difficultyLabel, levelSelect);

        const toolbar = el('div', { class: 'stgc-game-toolbar spider-toolbar' });
        const info = el('div', { class: 'stgc-game-info' });
        const scorePill = el('span', { class: 'stgc-pill' });
        const timePill = el('span', { class: 'stgc-pill' });
        const completePill = el('span', { class: 'stgc-pill' });
        info.append(scorePill, timePill, completePill);

        const undo = el('button', { class: 'stgc-btn', type: 'button' });
        undo.innerHTML = '<i class="fa-solid fa-rotate-left" aria-hidden="true"></i><span>撤销</span>';
        undo.addEventListener('click', () => { if (spiderUndo()) draw(); });

        const hint = el('button', { class: 'stgc-btn', type: 'button' });
        hint.innerHTML = '<i class="fa-solid fa-lightbulb" aria-hidden="true"></i><span>提示</span>';
        hint.addEventListener('click', () => {
            const suggestion = spiderFindHint(state.spider);
            state.spider.hint = suggestion;
            state.spider.message = suggestion
                ? (suggestion.stock ? '提示：可以从发牌堆发一轮。' : '提示：看发光的牌堆和目标列。')
                : '暂时没有可执行的移动。';
            draw();
        });

        const restart = el('button', { class: 'stgc-btn', type: 'button' });
        restart.innerHTML = '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>重新开始</span>';
        restart.addEventListener('click', () => {
            state.spider = newSpiderGame(levelSelect.value);
            draw();
        });
        toolbar.append(info, undo, hint, restart);

        const area = el('div', { class: 'spider-area' });
        const tableau = el('div', { class: 'spider-tableau', 'aria-label': '蜘蛛纸牌台面' });
        const bottom = el('div', { class: 'spider-bottom' });
        const stockButton = el('button', { class: 'stgc-btn spider-stock', type: 'button' });
        stockButton.setAttribute('aria-label', '发牌');
        const status = el('div', { class: 'spider-status' });
        bottom.append(stockButton, status);
        const help = el('div', {
            class: 'stgc-game-hint spider-help',
            text: '点击一张牌选中，再点击目标列移动；只有同花色连续的牌可以整组移动。电脑和手机都一样。',
        });

        area.append(tableau, bottom, help);
        body.append(difficultyBar, toolbar, area);

        stockButton.addEventListener('click', () => {
            if (spiderDealStock()) draw();
            else draw();
        });

        let timer = null;
        timer = window.setInterval(() => {
            if (state.currentGame !== 'spider' || state.spider !== game) return;
            if (!state.spider.won) {
                state.spider.time = Math.floor((Date.now() - state.spider.startedAt) / 1000);
                drawInfo();
            }
        }, 1000);

        state.cleanup = () => {
            window.clearInterval(timer);
        };

        function drawInfo() {
            const current = state.spider;
            const time = formatTime(current.time);
            scorePill.textContent = `分数 ${current.score}`;
            timePill.textContent = `时间 ${time}`;
            completePill.textContent = current.won ? `完成 8 / 8 · 通关` : `完成 ${current.completed} / 8`;
            undo.disabled = current.history.length === 0;
            stockButton.disabled = current.stock.length === 0 || current.won || current.tableau.some(pile => pile.length === 0);
            stockButton.innerHTML = current.stock.length
                ? `<i class="fa-solid fa-layer-group" aria-hidden="true"></i><span>发牌 ${Math.floor(current.stock.length / 10)} 轮</span>`
                : '<i class="fa-solid fa-check" aria-hidden="true"></i><span>发牌堆空了</span>';

            status.textContent = current.won
                ? `🎉 通关！${formatTime(current.time)} · ${current.moves} 次操作`
                : (current.message || `剩余发牌 ${Math.floor(current.stock.length / 10)} 轮`);
        }

        function draw() {
            const current = state.spider;
            tableau.innerHTML = '';
            drawInfo();

            for (let col = 0; col < 10; col++) {
                const pileWrap = el('div', { class: 'spider-column' });
                const pile = current.tableau[col];
                if (!pile.length) {
                    const empty = el('button', { class: 'spider-empty', type: 'button', text: '空' });
                    empty.setAttribute('aria-label', `第 ${col + 1} 列为空`);
                    empty.addEventListener('click', () => {
                        if (current.selected && spiderMove(current.selected.column, current.selected.index, col)) {
                            current.selected = null;
                            draw();
                        }
                    });
                    pileWrap.append(empty);
                } else {
                    pile.forEach((card, index) => {
                        const isSelected = current.selected?.column === col && current.selected.index === index;
                        const isHintFrom = current.hint && !current.hint.stock && current.hint.from === col && current.hint.index === index;
                        const isHintTo = current.hint && !current.hint.stock && current.hint.to === col;
                        const button = el('button', {
                            class: `spider-card ${card.faceUp ? 'face-up' : 'face-down'}${isSelected ? ' selected' : ''}${isHintFrom ? ' hint-from' : ''}`,
                            type: 'button',
                            'aria-label': card.faceUp ? `${card.suit}${card.rank}` : '背面朝上',
                        });
                        button.style.setProperty('--card-offset', `${index * 27}px`);
                        button.style.zIndex = String(index + 1);
                        if (card.faceUp) {
                            button.innerHTML = `<span class="spider-rank">${card.rank === 1 ? 'A' : card.rank === 11 ? 'J' : card.rank === 12 ? 'Q' : card.rank === 13 ? 'K' : card.rank}</span><span class="spider-suit">${card.suit}</span>`;
                            button.dataset.suit = card.suit;
                        }
                        button.addEventListener('click', () => {
                            current.hint = null;
                            spiderClickCard(col, index);
                            draw();
                        });
                        if (isHintTo && pile.length && index === pile.length - 1) button.classList.add('hint-to');
                        pileWrap.append(button);
                    });
                }
                tableau.append(pileWrap);
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
        document.addEventListener('keydown', event => {
            if (event.altKey && event.key.toLowerCase() === 'g') {
                event.preventDefault();
                event.stopPropagation();
                const launcher = document.getElementById(`${APP_ID}-launcher`);
                if (launcher?.classList.contains('is-hidden')) setLauncherHidden(false);
                else openCenter();
            }
        }, true);
        window.addEventListener('resize', () => {
            const launcher = document.getElementById(`${APP_ID}-launcher`);
            if (!launcher || launcher.classList.contains('is-hidden')) return;
            const rect = launcher.getBoundingClientRect();
            setLauncherPosition(rect.left, rect.top, true);
        });
        console.log('[Silly Game] loaded');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
