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
        gomoku: null,
        puzzle15: null,
        tetris: null,
        go: null,
        waterSort: null,
        farm: null,
        cake: null,
    };

    const EXTENSION_SETTINGS_KEY = 'silly-game';
    const DEFAULT_EXTENSION_FOLDER = 'st-game-center';
    const LOADED_SCRIPT_URL = document.currentScript?.src || '';
    const CURRENT_VERSION = '0.13.4';
    const UPDATE_CHECK_INTERVAL = 6 * 60 * 60 * 1000;
    const DEFAULT_EXTENSION_SETTINGS = Object.freeze({
        launcherEnabled: true,
        autoUpdate: true,
        lastUpdateCheck: 0,
    });
    let updateCheckPromise = null;
    let refreshFarmSeedRow = null;

    const FARM_STORAGE_KEY = 'silly-game-farm-v1';
    const GAME_WINS_STORAGE_KEY = 'silly-game-wins-v1';
    const FARM_CROPS = {
        carrot:    { name: '胡萝卜', seedCost: 2, sell: 6,  grow: 70,  starter: true },
        potato:    { name: '土豆',   seedCost: 3, sell: 9,  grow: 85,  starter: true },
        radish:    { name: '萝卜',   seedCost: 3, sell: 10, grow: 95,  unlock: 'mines' },
        tomato:    { name: '番茄',   seedCost: 4, sell: 13, grow: 110, unlock: '2048' },
        corn:      { name: '玉米',   seedCost: 5, sell: 16, grow: 125, unlock: 'sokoban' },
        strawberry:{ name: '草莓',  seedCost: 5, sell: 18, grow: 140, unlock: 'sudoku' },
        pumpkin:   { name: '南瓜',   seedCost: 6, sell: 22, grow: 155, unlock: 'spider' },
        watermelon:{ name: '西瓜',  seedCost: 7, sell: 26, grow: 175, unlock: 'gomoku' },
        blueberry: { name: '蓝莓',   seedCost: 7, sell: 28, grow: 185, unlock: 'puzzle15' },
        grape:     { name: '葡萄',   seedCost: 8, sell: 32, grow: 200, unlock: 'tetris' },
        tea:       { name: '茶叶',   seedCost: 9, sell: 36, grow: 220, unlock: 'go' },
        lavender:  { name: '薰衣草', seedCost: 10, sell: 42, grow: 240, unlock: 'waterSort' },
    };
    const FARM_GAME_NAMES = {
        mines: '扫雷', '2048': '2048', sokoban: '推箱子', sudoku: '数独', spider: '蜘蛛纸牌',
        gomoku: '五子棋', puzzle15: '数字华容道', tetris: '俄罗斯方块', go: '围棋', waterSort: '倒水瓶',
    };

    function loadGameWins() {
        try {
            const raw = JSON.parse(localStorage.getItem(GAME_WINS_STORAGE_KEY) || '[]');
            return new Set(Array.isArray(raw) ? raw.filter(key => typeof key === 'string') : []);
        } catch { return new Set(); }
    }

    function saveGameWins(wins) {
        try { localStorage.setItem(GAME_WINS_STORAGE_KEY, JSON.stringify([...wins])); } catch { /* ignore */ }
    }

    function recordGameWin(gameId) {
        if (!gameId || !FARM_GAME_NAMES[gameId]) return;
        const wins = loadGameWins();
        if (wins.has(gameId)) return;
        wins.add(gameId);
        saveGameWins(wins);
        const crop = Object.entries(FARM_CROPS).find(([, data]) => data.unlock === gameId)?.[1];
        if (crop) {
            notify(`你赢下了${FARM_GAME_NAMES[gameId]}，解锁新作物：${crop.name}`, 'Silly Farm');
            // 如果农场当前正开着，立即刷新种子栏，不需要退出再进入。
            refreshFarmSeedRow?.();
        }
    }

    function farmDefaultState() {
        return {
            coins: 30,
            selectedCrop: 'carrot',
            plots: Array.from({ length: 12 }, () => null),
            harvested: 0,
            lastTick: Date.now(),
        };
    }

    function farmLoad() {
        try {
            const raw = JSON.parse(localStorage.getItem(FARM_STORAGE_KEY) || 'null');
            if (!raw || !Array.isArray(raw.plots) || raw.plots.length !== 12) return null;
            return {
                ...farmDefaultState(),
                ...raw,
                plots: raw.plots.map(plot => plot && typeof plot === 'object' ? plot : null),
            };
        } catch { return null; }
    }

    function farmSave(game = state.farm) {
        try {
            if (game) localStorage.setItem(FARM_STORAGE_KEY, JSON.stringify(game));
        } catch { /* ignore */ }
    }

    function farmIsUnlocked(cropId) {
        const crop = FARM_CROPS[cropId];
        if (!crop) return false;
        if (crop.starter) return true;
        return loadGameWins().has(crop.unlock);
    }

    function farmGrowth(plot) {
        if (!plot || !FARM_CROPS[plot.crop]) return 0;
        const crop = FARM_CROPS[plot.crop];
        let duration = crop.grow;
        if (plot.watered) duration *= 0.72;
        if (plot.fertilized) duration *= 0.62;
        const elapsed = Math.max(0, (Date.now() - Number(plot.plantedAt || Date.now())) / 1000);
        return Math.min(1, elapsed / duration);
    }

    function farmStage(plot) {
        const progress = farmGrowth(plot);
        if (progress >= 1) return { key: 'ripe', text: '成熟' };
        if (progress >= 0.66) return { key: 'growing', text: '生长中' };
        if (progress >= 0.30) return { key: 'sprout', text: '发芽' };
        return { key: 'soil', text: '刚种下' };
    }

    function farmFormatTimeLeft(plot) {
        const progress = farmGrowth(plot);
        if (progress >= 1) return '可以收获';
        const crop = FARM_CROPS[plot.crop];
        let duration = crop.grow;
        if (plot.watered) duration *= 0.72;
        if (plot.fertilized) duration *= 0.62;
        const remaining = Math.max(0, Math.ceil(duration * (1 - progress)));
        if (remaining >= 60) return `约 ${Math.ceil(remaining / 60)} 分钟`;
        return `${remaining} 秒`;
    }

    function getSTContext() {
        try {
            return window.SillyTavern?.getContext?.() || window.TavernAI?.getContext?.() || null;
        } catch {
            return null;
        }
    }

    function getExtensionSettings() {
        const context = getSTContext();
        const settings = context?.extensionSettings;
        if (!settings) return null;
        if (!settings[EXTENSION_SETTINGS_KEY]) {
            settings[EXTENSION_SETTINGS_KEY] = { ...DEFAULT_EXTENSION_SETTINGS };
        } else {
            if (typeof settings[EXTENSION_SETTINGS_KEY].launcherEnabled !== 'boolean') {
                settings[EXTENSION_SETTINGS_KEY].launcherEnabled = DEFAULT_EXTENSION_SETTINGS.launcherEnabled;
            }
            if (typeof settings[EXTENSION_SETTINGS_KEY].autoUpdate !== 'boolean') {
                settings[EXTENSION_SETTINGS_KEY].autoUpdate = DEFAULT_EXTENSION_SETTINGS.autoUpdate;
            }
            if (!Number.isFinite(settings[EXTENSION_SETTINGS_KEY].lastUpdateCheck)) {
                settings[EXTENSION_SETTINGS_KEY].lastUpdateCheck = DEFAULT_EXTENSION_SETTINGS.lastUpdateCheck;
            }
        }
        return settings[EXTENSION_SETTINGS_KEY];
    }

    function saveExtensionSettings() {
        try {
            getSTContext()?.saveSettingsDebounced?.();
        } catch {
            // SillyTavern API may not be ready yet; local fallback still works.
        }
    }

    async function getSTRequestHeaders() {
        try {
            const core = await import('/script.js');
            return core.getRequestHeaders?.() || { 'Content-Type': 'application/json' };
        } catch {
            return { 'Content-Type': 'application/json' };
        }
    }

    function notify(message, title = '') {
        try {
            if (typeof window.toastr !== 'undefined') {
                if (title) window.toastr.info(message, title);
                else window.toastr.info(message);
                return;
            }
        } catch { /* ignore */ }
        console.info('[Silly Game]', title ? `${title}: ${message}` : message);
    }

    function updateButtonText(text, spinning = false) {
        document.querySelectorAll('[data-stgc-update-button]').forEach(button => {
            button.disabled = spinning;
            button.innerHTML = spinning
                ? '<i class=\"fa-solid fa-spinner fa-spin\" aria-hidden=\"true\"></i><span>检查中…</span>'
                : `<i class=\"fa-solid fa-cloud-arrow-down\" aria-hidden=\"true\"></i><span>${text}</span>`;
        });
    }

    function getLoadedExtensionFolder() {
        // SillyTavern loads third-party extensions from /third-party/<folder>/index.js.
        // Use the real loaded folder when possible instead of assuming the GitHub
        // repository is named st-game-center.
        const match = LOADED_SCRIPT_URL.match(/\/third-party\/([^/]+)\/index\.js(?:[?#].*)?$/i);
        return match ? decodeURIComponent(match[1]) : null;
    }

    async function discoverInstallScope() {
        const headers = await getSTRequestHeaders();
        const response = await fetch('/api/extensions/discover', {
            method: 'GET',
            headers,
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `${response.status} ${response.statusText}`);
        }

        const extensions = await response.json();
        if (!Array.isArray(extensions)) return null;

        const loadedFolder = getLoadedExtensionFolder();
        const candidates = [loadedFolder, DEFAULT_EXTENSION_FOLDER, 'Silly-Game', 'Silly Game']
            .filter(Boolean)
            .map(String);

        let found = null;
        for (const folder of candidates) {
            found = extensions.find(extension => extension?.name === `third-party/${folder}`);
            if (found) break;
        }

        if (!found) {
            // Fallback for a GitHub repo whose folder name differs from the usual one.
            found = extensions.find(extension => {
                const name = String(extension?.name || '').toLowerCase();
                return name.startsWith('third-party/') && /silly[-_ ]?game/.test(name);
            });
        }

        if (!found) return null;

        const folder = String(found.name).replace(/^third-party\//, '');
        if (!folder) return null;
        if (found.type === 'local') return { global: false, type: 'local', extensionName: folder };
        if (found.type === 'global') return { global: true, type: 'global', extensionName: folder };
        return null;
    }

    async function getRemoteExtensionVersion(scope) {
        const headers = await getSTRequestHeaders();
        const response = await fetch('/api/extensions/version', {
            method: 'POST',
            headers,
            body: JSON.stringify({ extensionName: scope.extensionName, global: !!scope.global }),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `${response.status} ${response.statusText}`);
        }
        return response.json();
    }

    async function updateExtensionFromSillyTavern(scope) {
        const headers = await getSTRequestHeaders();
        const response = await fetch('/api/extensions/update', {
            method: 'POST',
            headers,
            body: JSON.stringify({ extensionName: scope.extensionName, global: !!scope.global }),
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(text || `${response.status} ${response.statusText}`);
        }
        return response.json();
    }

    async function checkForSillyGameUpdate({ auto = false } = {}) {
        if (updateCheckPromise) return updateCheckPromise;

        updateCheckPromise = (async () => {
            const settings = getExtensionSettings();
            const now = Date.now();
            if (auto && settings && !settings.autoUpdate) return { skipped: true, updated: false, available: false };
            if (auto && settings && Number.isFinite(settings.lastUpdateCheck) && now - settings.lastUpdateCheck < UPDATE_CHECK_INTERVAL) {
                return { skipped: true, updated: false, available: false };
            }

            settings.lastUpdateCheck = now;
            saveExtensionSettings();
            updateButtonText('检查更新', true);

            try {
                const scope = await discoverInstallScope();
                if (!scope) {
                    updateButtonText('无法自动更新');
                    if (!auto) notify('没有在 SillyTavern 的托管第三方扩展目录中找到 Silly Game。请确认它是通过 GitHub 扩展安装方式安装的。', 'Silly Game');
                    return { skipped: false, updated: false, available: false, unmanaged: true };
                }

                const version = await getRemoteExtensionVersion(scope);
                const available = version?.isUpToDate === false;
                if (!available) {
                    updateButtonText('已是最新');
                    if (!auto) notify(`当前版本 v${CURRENT_VERSION} 已是最新。`, 'Silly Game');
                    return { skipped: false, updated: false, available: false, version };
                }

                const remoteCommit = version?.currentCommitHash ? String(version.currentCommitHash).slice(0, 7) : '新版本';
                if (!auto) notify(`发现更新（${remoteCommit}），正在更新…`, 'Silly Game');
                const result = await updateExtensionFromSillyTavern(scope);
                if (result?.isUpToDate) {
                    updateButtonText('已是最新');
                    if (!auto) notify('检查完成，当前已经是最新版本。', 'Silly Game');
                    return { skipped: false, updated: false, available: false, version: result };
                }

                updateButtonText('更新完成');
                if (!auto) notify('Silly Game 已更新，页面即将刷新以应用更新。', 'Silly Game');
                else notify('Silly Game 已自动更新，正在刷新页面。', 'Silly Game');
                setTimeout(() => location.reload(), auto ? 800 : 1200);
                return { skipped: false, updated: true, available: true, version: result };
            } catch (error) {
                console.error('[Silly Game] update check failed:', error);
                updateButtonText('检查更新');
                if (!auto) notify(`更新检查失败：${error?.message || error}`, 'Silly Game');
                return { skipped: false, updated: false, available: false, error };
            }
        })().finally(() => {
            updateCheckPromise = null;
        });

        return updateCheckPromise;
    }

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
        const settings = getExtensionSettings();
        if (settings) return settings.launcherEnabled === false;
        try {
            return localStorage.getItem(LAUNCHER_HIDDEN_KEY) === '1';
        } catch {
            return false;
        }
    }

    function setLauncherHidden(hidden, persist = true) {
        const launcher = document.getElementById(`${APP_ID}-launcher`);
        if (launcher) {
            launcher.classList.toggle('is-hidden', hidden);
            launcher.setAttribute('aria-hidden', hidden ? 'true' : 'false');
            launcher.tabIndex = hidden ? -1 : 0;
        }
        const restore = document.getElementById(`${APP_ID}-restore`);
        if (restore) restore.classList.toggle('show', hidden);

        const settings = getExtensionSettings();
        if (settings && settings.launcherEnabled !== !hidden) {
            settings.launcherEnabled = !hidden;
            if (persist) saveExtensionSettings();
        }
        if (persist) {
            try {
                localStorage.setItem(LAUNCHER_HIDDEN_KEY, hidden ? '1' : '0');
            } catch { /* ignore */ }
        }
        updateExtensionSettingsUI();
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

    function updateExtensionSettingsUI() {
        const settings = getExtensionSettings();
        const launcherCheckbox = document.getElementById('stgc_extension_launcher_enabled');
        if (launcherCheckbox) launcherCheckbox.checked = !isLauncherHidden();
        const autoUpdateCheckbox = document.getElementById('stgc_extension_auto_update');
        if (autoUpdateCheckbox && settings) autoUpdateCheckbox.checked = settings.autoUpdate !== false;
        const versionLabel = document.getElementById('stgc_extension_version_label');
        if (versionLabel) versionLabel.textContent = `当前版本 v${CURRENT_VERSION}`;
    }

    function addExtensionSettingsPanel() {
        if (document.getElementById('stgc-extension-settings')) return true;
        const container = document.getElementById('extensions_settings2');
        if (!container) return false;

        const settings = getExtensionSettings();
        if (!settings) return false;

        const wrapper = document.createElement('div');
        wrapper.id = 'stgc-extension-settings';
        wrapper.innerHTML = `
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Silly Game</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <label class="checkbox_label" for="stgc_extension_launcher_enabled">
                        <input id="stgc_extension_launcher_enabled" type="checkbox" class="checkbox">
                        <small>显示 Silly Game 悬浮按钮</small>
                    </label>
                    <label class="checkbox_label" for="stgc_extension_auto_update">
                        <input id="stgc_extension_auto_update" type="checkbox" class="checkbox">
                        <small>自动检查并更新 Silly Game</small>
                    </label>
                    <div class="stgc-extension-update-row">
                        <span id="stgc_extension_version_label">当前版本 v${CURRENT_VERSION}</span>
                        <button type="button" class="menu_button stgc-extension-update-btn" data-stgc-update-button>
                            <i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i>
                            <span>检查更新</span>
                        </button>
                    </div>
                    <small class="stgc-extension-note">
                        悬浮按钮可自由拖动。自动更新会在启动时定期检查；发现新版本后自动更新并刷新页面。
                    </small>
                </div>
            </div>`;

        container.append(wrapper);
        const checkbox = wrapper.querySelector('#stgc_extension_launcher_enabled');
        checkbox.checked = settings.launcherEnabled !== false;
        checkbox.addEventListener('input', () => {
            const enabled = checkbox.checked;
            setLauncherHidden(!enabled, true);
        });
        const autoUpdateCheckbox = wrapper.querySelector('#stgc_extension_auto_update');
        autoUpdateCheckbox.checked = settings.autoUpdate !== false;
        autoUpdateCheckbox.addEventListener('input', () => {
            settings.autoUpdate = autoUpdateCheckbox.checked;
            saveExtensionSettings();
        });
        wrapper.querySelector('[data-stgc-update-button]').addEventListener('click', () => {
            void checkForSillyGameUpdate({ auto: false });
        });
        return true;
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
            { id: 'gomoku', icon: 'fa-circle-dot', name: '五子棋', desc: '15×15 · 本地 AI · 无需 API' },
            { id: 'puzzle15', icon: 'fa-border-all', name: '数字华容道', desc: '3×3 / 4×4 / 5×5 · 经典滑块' },
            { id: 'tetris', icon: 'fa-shapes', name: '俄罗斯方块', desc: '10×20 · 消行 · 方向键 / 虚拟键' },
            { id: 'go', icon: 'fa-circle-half-stroke', name: '围棋', desc: '9×9 / 13×13 / 19×19 · 本地 AI / 双人' },
            { id: 'waterSort', icon: 'fa-droplet', name: '倒水瓶', desc: '颜色分类 · 60关 + 无尽模式 · 自动保存' },
            { id: 'farm', icon: 'fa-seedling', name: '小农场', desc: '种地 · 浇水 · 施肥 · 作物随胜利解锁' },
            { id: 'cake', icon: 'fa-cake-candles', name: '叠蛋糕', desc: '左右移动 · 点击落下 · 越叠越高' },
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

        const updateRow = el('div', { class: 'stgc-home-update-row' });
        const updateInfo = el('div', { class: 'stgc-home-update-info' }, [
            el('span', { class: 'stgc-home-update-version', text: `v${CURRENT_VERSION}` }),
            el('span', { class: 'stgc-home-update-text', text: '检查 Silly Game 更新' }),
        ]);
        const updateBtn = el('button', { class: 'stgc-btn stgc-home-update-btn', type: 'button' });
        updateBtn.setAttribute('data-stgc-update-button', '1');
        updateBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down" aria-hidden="true"></i><span>检查更新</span>';
        updateBtn.addEventListener('click', () => { void checkForSillyGameUpdate({ auto: false }); });
        updateRow.append(updateInfo, updateBtn);

        panel.append(header, intro, grid, updateRow);
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
            gomoku: '五子棋',
            puzzle15: '数字华容道',
            tetris: '俄罗斯方块',
            go: '围棋',
            waterSort: '倒水瓶',
            farm: '小农场',
            cake: '叠蛋糕',
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
        else if (game === 'gomoku') renderGomoku(body);
        else if (game === 'puzzle15') render15Puzzle(body);
        else if (game === 'tetris') renderTetris(body);
        else if (game === 'go') renderGo(body);
        else if (game === 'waterSort') renderWaterSort(body);
        else if (game === 'farm') renderFarm(body);
        else if (game === 'cake') renderCake(body);
    }

    /* ==================== 叠蛋糕 ==================== */



    const CAKE_STORAGE_KEY = 'silly-game:cake:v1';

    function cakeLoad() {
        try {
            const raw = JSON.parse(localStorage.getItem(CAKE_STORAGE_KEY) || 'null');
            if (!raw || typeof raw !== 'object') return { best: 0, bestScore: 0 };
            return {
                best: Number.isFinite(raw.best) ? raw.best : 0,
                bestScore: Number.isFinite(raw.bestScore) ? raw.bestScore : 0,
            };
        } catch {
            return { best: 0, bestScore: 0 };
        }
    }

    function cakeSave(record) {
        try { localStorage.setItem(CAKE_STORAGE_KEY, JSON.stringify(record)); } catch { /* ignore */ }
    }

    function renderCake(body) {
        const savedBest = cakeLoad();
        const game = {
            layers: [],
            current: null,
            direction: 1,
            speed: 145,
            score: 0,
            running: true,
            over: false,
            raf: 0,
            lastTime: performance.now(),
            areaWidth: 0,
            cameraY: 0,
        };
        state.cake = game;

        const wrap = el('div', { class: 'cake-game-wrap' });
        const top = el('div', { class: 'cake-topbar' });
        const status = el('div', { class: 'cake-status' });
        const scoreText = el('span', { text: '层数 1 · 分数 0' });
        const bestText = el('span', { text: `最高 ${savedBest.best} 层` });
        status.append(scoreText, bestText);
        const reset = el('button', { class: 'stgc-btn', type: 'button' });
        reset.innerHTML = '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>重新开始</span>';

        const hint = el('div', { class: 'cake-hint', text: '点击蛋糕落下 · 电脑可按空格 / Enter · 手机直接点屏幕' });
        const scene = el('div', { class: 'cake-scene', role: 'application', 'aria-label': '叠蛋糕' });
        const sky = el('div', { class: 'cake-sky', 'aria-hidden': 'true' });
        const stack = el('div', { class: 'cake-stack' });
        const floor = el('div', { class: 'cake-floor' });
        const cameraIndicator = el('div', { class: 'cake-camera-indicator', text: '层数 1' });
        const overlay = el('div', { class: 'cake-overlay' });
        overlay.hidden = true;
        const overlayText = el('div', { class: 'cake-overlay-text' });
        const overlayButton = el('button', { class: 'stgc-btn', type: 'button', text: '再来一块' });
        overlay.append(overlayText, overlayButton);
        scene.append(sky, stack, floor, cameraIndicator, overlay);
        wrap.append(top, hint, scene);
        body.append(wrap);

        function sceneWidth() {
            return Math.max(280, scene.clientWidth || 320);
        }

        function sceneHeight() {
            return Math.max(320, scene.clientHeight || 420);
        }

        function layerNode(width, left, bottom, moving, index) {
            const node = el('div', { class: `cake-layer${moving ? ' moving' : ''}` });
            node.style.width = `${width}px`;
            node.style.left = `${left}px`;
            node.style.bottom = `${bottom}px`;
            node.style.setProperty('--cake-hue', `${350 + (index % 6) * 7}`);
            node.innerHTML = '<span class="cake-frosting"></span><span class="cake-cream"></span><span class="cake-sprinkle s1"></span><span class="cake-sprinkle s2"></span><span class="cake-sprinkle s3"></span>';
            stack.append(node);
            return node;
        }

        function highestWorldTop() {
            let top = 0;
            for (const layer of game.layers) top = Math.max(top, layer.bottom + 27);
            if (game.current) top = Math.max(top, game.current.bottom + 27);
            return top;
        }

        function updateCamera(animate = false) {
            const targetCenter = sceneHeight() * 0.56;
            const worldTop = highestWorldTop();
            const desired = Math.max(0, worldTop - targetCenter);
            game.cameraY = desired;
            stack.style.transform = `translate3d(0, ${-game.cameraY}px, 0)`;
            cameraIndicator.textContent = `层数 ${Math.max(1, game.layers.length)}`;
            if (animate) {
                cameraIndicator.classList.remove('show');
                void cameraIndicator.offsetWidth;
                cameraIndicator.classList.add('show');
            }
        }

        function updateStatus() {
            scoreText.textContent = `层数 ${Math.max(1, game.layers.length)} · 分数 ${game.score}`;
            bestText.textContent = `最高 ${Math.max(savedBest.best, Math.max(0, game.layers.length - 1))} 层`;
            cameraIndicator.textContent = `层数 ${Math.max(1, game.layers.length)}`;
        }

        function resetRound() {
            game.layers = [];
            game.current = null;
            game.direction = Math.random() > 0.5 ? 1 : -1;
            game.speed = 145;
            game.score = 0;
            game.running = true;
            game.over = false;
            game.cameraY = 0;
            game.areaWidth = sceneWidth();
            stack.innerHTML = '';
            stack.style.transform = 'translate3d(0,0,0)';
            overlay.hidden = true;

            const width = Math.min(230, Math.max(150, game.areaWidth * 0.45));
            const left = (game.areaWidth - width) / 2;
            const node = layerNode(width, left, 9, false, 0);
            game.layers.push({ width, left, bottom: 9, node });
            updateStatus();
            spawnLayer();
            game.lastTime = performance.now();
            updateCamera();
        }

        function spawnLayer() {
            const below = game.layers[game.layers.length - 1];
            const width = below.width;
            const left = game.direction > 0 ? 0 : Math.max(0, game.areaWidth - width);
            const bottom = below.bottom + 27;
            const node = layerNode(width, left, bottom, true, game.layers.length);
            game.current = { width, left, bottom, node };
            updateCamera();
        }

        function finish() {
            if (game.over) return;
            game.over = true;
            game.running = false;
            const height = Math.max(0, game.layers.length - 1);
            const record = {
                best: Math.max(savedBest.best, height),
                bestScore: Math.max(savedBest.bestScore, game.score),
            };
            cakeSave(record);
            overlayText.innerHTML = `<strong>蛋糕倒塌了</strong><span>你叠了 ${height} 层 · ${game.score} 分</span>`;
            overlay.hidden = false;
            updateStatus();
        }

        function drop() {
            if (!game.running || game.over || !game.current) return;
            const top = game.current;
            const below = game.layers[game.layers.length - 1];
            const left = Math.max(top.left, below.left);
            const right = Math.min(top.left + top.width, below.left + below.width);
            const overlap = right - left;
            if (overlap <= 0.5) {
                finish();
                return;
            }
            const perfect = Math.abs(overlap - below.width) <= 2;
            const width = perfect ? below.width : overlap;
            const finalLeft = perfect ? below.left : left;
            top.node.style.width = `${width}px`;
            top.node.style.left = `${finalLeft}px`;
            top.node.classList.remove('moving');
            top.node.classList.add(perfect ? 'perfect' : 'landed');

            game.layers.push({ width, left: finalLeft, bottom: top.bottom, node: top.node });
            game.current = null;
            game.score += perfect ? 50 + game.layers.length * 5 : 10 + game.layers.length * 2;
            game.direction *= -1;
            game.speed = Math.min(360, 145 + game.layers.length * 6);
            updateStatus();
            updateCamera(true);

            if (width < 8) {
                finish();
                return;
            }
            spawnLayer();
        }

        function step(now) {
            if (!game.running || game.over) return;
            const dt = Math.min(35, now - game.lastTime) / 1000;
            game.lastTime = now;
            if (!game.current) spawnLayer();
            const c = game.current;
            c.left += game.direction * game.speed * dt;
            const maxLeft = Math.max(0, game.areaWidth - c.width);
            if (c.left <= 0) {
                c.left = 0;
                game.direction = 1;
            } else if (c.left >= maxLeft) {
                c.left = maxLeft;
                game.direction = -1;
            }
            c.node.style.left = `${c.left}px`;
            updateCamera();
            game.raf = requestAnimationFrame(step);
        }

        function resize() {
            game.areaWidth = sceneWidth();
            for (const layer of game.layers) {
                const maxLeft = Math.max(0, game.areaWidth - layer.width);
                layer.left = Math.min(Math.max(layer.left, 0), maxLeft);
                layer.node.style.left = `${layer.left}px`;
            }
            if (game.current) {
                const maxLeft = Math.max(0, game.areaWidth - game.current.width);
                game.current.left = Math.min(Math.max(game.current.left, 0), maxLeft);
                game.current.node.style.left = `${game.current.left}px`;
            }
            updateCamera();
        }

        const onKey = event => {
            if (state.currentGame !== 'cake') return;
            if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                drop();
            }
        };
        const onResize = () => resize();

        reset.addEventListener('click', resetRound);
        overlayButton.addEventListener('click', resetRound);
        scene.addEventListener('pointerdown', event => {
            if (event.target.closest('button')) return;
            event.preventDefault();
            drop();
        }, { passive: false });
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onResize);

        resetRound();
        game.raf = requestAnimationFrame(step);
        state.cleanup = () => {
            game.running = false;
            cancelAnimationFrame(game.raf);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('resize', onResize);
        };
    }

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
            recordGameWin('mines');
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

    const GAME_MINES_STORAGE_KEY = 'st-mini-game-center:mines-v2';

    function saveMines() {
        const s = state.mines;
        if (!s) return;
        try {
            localStorage.setItem(GAME_MINES_STORAGE_KEY, JSON.stringify({
                version: 2,
                difficulty: s.difficulty,
                size: s.size,
                mineCount: s.mineCount,
                cells: s.cells,
                flags: s.flags,
                gameOver: s.gameOver,
                won: s.won,
                mode: s.mode,
                elapsed: s.startedAt ? Math.floor((Date.now() - s.startedAt) / 1000) : s.time,
                time: s.time,
                firstMove: s.firstMove,
                minesPlaced: s.minesPlaced,
            }));
        } catch (error) {
            console.warn('[Silly Game] 保存扫雷存档失败', error);
        }
    }

    function loadMines() {
        try {
            const raw = localStorage.getItem(GAME_MINES_STORAGE_KEY);
            if (!raw) return null;
            const saved = JSON.parse(raw);
            const config = MINES_DIFFICULTIES[saved.difficulty];
            if (!config || saved.size !== config.size || saved.mineCount !== config.mines) return null;
            if (!Array.isArray(saved.cells) || saved.cells.length !== config.size * config.size) return null;
            const elapsed = Number.isFinite(saved.elapsed) ? Math.max(0, Math.floor(saved.elapsed)) : 0;
            const active = !saved.gameOver && !saved.won && !saved.firstMove;
            return {
                difficulty: saved.difficulty,
                size: config.size,
                mineCount: config.mines,
                cells: saved.cells.map(cell => ({
                    mine: !!cell.mine,
                    open: !!cell.open,
                    flag: !!cell.flag,
                    count: Number.isInteger(cell.count) ? cell.count : 0,
                })),
                flags: Math.max(0, Math.min(config.mines, Number(saved.flags) || 0)),
                gameOver: !!saved.gameOver,
                won: !!saved.won,
                mode: saved.mode === 'flag' ? 'flag' : 'open',
                startedAt: active ? Date.now() - elapsed * 1000 : null,
                time: elapsed,
                firstMove: !!saved.firstMove,
                minesPlaced: !!saved.minesPlaced,
            };
        } catch (error) {
            console.warn('[Silly Game] 读取扫雷存档失败', error);
            return null;
        }
    }

    function clearMinesSave() {
        try {
            localStorage.removeItem(GAME_MINES_STORAGE_KEY);
        } catch { /* ignore */ }
    }

    function renderMinesweeper(body) {
        // 首次使用默认“新手”9×9；已有存档则恢复上次的棋盘。
        state.mines = loadMines() || createMinesweeper('beginner');

        let mineZoom = window.innerWidth <= 640 ? 1.25 : 1;
        let mineCellSize = 32;

        function getMineCellSize(size) {
            if (size >= 24) return 24;
            if (size >= 20) return 26;
            if (size >= 16) return 28;
            return 34;
        }

        function getMineMaxZoom(size) {
            if (size >= 24) return 2.4;
            if (size >= 20) return 2.6;
            return 3;
        }

        const difficultyBar = el('div', { class: 'stgc-difficulty-bar' });
        difficultyBar.append(el('span', { class: 'stgc-difficulty-label', text: '难度' }));
        for (const [id, config] of Object.entries(MINES_DIFFICULTIES)) {
            const btn = el('button', {
                class: 'stgc-btn stgc-btn-quiet stgc-difficulty-btn',
                type: 'button',
                text: config.name,
            });
            btn.dataset.difficulty = id;
            btn.addEventListener('click', () => {
                clearMinesSave();
                state.mines = createMinesweeper(id);
                mineZoom = window.innerWidth <= 640 ? 1.25 : 1;
                draw();
                centerMineView();
                saveMines();
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

        resetBtn.addEventListener('click', () => {
            clearMinesSave();
            state.mines = createMinesweeper(state.mines.difficulty);
            mineZoom = window.innerWidth <= 640 ? 1.25 : 1;
            draw();
            centerMineView();
            saveMines();
        });

        modeBtn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (!state.mines || state.mines.gameOver || state.mines.won) return;
            state.mines.mode = state.mines.mode === 'open' ? 'flag' : 'open';
            updateToolbar();
            saveMines();
        });

        const mineViewport = el('div', {
            class: 'mine-viewport',
            role: 'region',
            'aria-label': '扫雷可视区域',
        });
        const board = el('div', {
            class: 'mine-board',
            role: 'grid',
            'aria-label': '扫雷棋盘',
        });
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
            text: '手机：长按标记 · 开启标记模式也可直接点 · 电脑：左键翻开、右键标记 · 数字再次点击展开 · 视野可放大并用方向键微调',
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
            event.stopPropagation();
            scrollMineView(...move);
        };
        document.addEventListener('keydown', onMineViewKey, true);

        const tick = window.setInterval(() => {
            if (!state.mines || state.mines.gameOver || state.mines.won || !state.mines.startedAt) return;
            state.mines.time = Math.floor((Date.now() - state.mines.startedAt) / 1000);
            updateToolbar();
            saveMines();
        }, 1000);

        let longPressTimer = null;
        let longPressActive = false;
        let suppressNextTouchClick = false;
        let lastTouchAt = 0;

        const onPointerDown = event => {
            const cell = event.target.closest?.('.mine-cell');
            if (!cell || !board.contains(cell)) return;
            if (event.pointerType !== 'touch') return;
            lastTouchAt = Date.now();
            longPressActive = false;
            clearTimeout(longPressTimer);
            longPressTimer = window.setTimeout(() => {
                const current = state.mines;
                if (!current || current.gameOver || current.won) return;
                longPressActive = true;
                suppressNextTouchClick = true;
                minesToggleFlag(Number(cell.dataset.index));
                saveMines();
                draw();
            }, 450);
        };

        const onPointerUp = event => {
            if (event.pointerType !== 'touch') return;
            clearTimeout(longPressTimer);
            if (longPressActive) {
                event.preventDefault();
                event.stopPropagation();
            }
            longPressActive = false;
        };

        const onPointerCancel = event => {
            if (event.pointerType !== 'touch') return;
            clearTimeout(longPressTimer);
            longPressActive = false;
        };

        const onContext = event => {
            const cellElement = event.target.closest?.('.mine-cell');
            if (!cellElement || !board.contains(cellElement)) return;
            event.preventDefault();
            event.stopPropagation();
            // 手机长按已经由 pointer timer 处理，避免第二次切换。
            if (Date.now() - lastTouchAt < 900) return;
            minesToggleFlag(Number(cellElement.dataset.index));
            saveMines();
            draw();
        };

        const onCellClick = event => {
            const cellElement = event.target.closest?.('.mine-cell');
            if (!cellElement || !board.contains(cellElement)) return;
            if (suppressNextTouchClick && Date.now() - lastTouchAt < 1100) {
                suppressNextTouchClick = false;
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const index = Number(cellElement.dataset.index);
            const current = state.mines;
            if (!current) return;
            if (current.mode === 'flag') {
                minesToggleFlag(index);
            } else if (current.cells[index].open && current.cells[index].count > 0) {
                minesChord(index);
            } else {
                minesReveal(index);
            }
            saveMines();
            draw();
        };

        board.addEventListener('pointerdown', onPointerDown);
        board.addEventListener('pointerup', onPointerUp);
        board.addEventListener('pointercancel', onPointerCancel);
        board.addEventListener('contextmenu', onContext);
        board.addEventListener('click', onCellClick);

        const onKey = event => {
            if (state.currentGame !== 'mines' || !state.mines) return;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
            if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                event.stopPropagation();
                if (!state.mines.gameOver && !state.mines.won) {
                    state.mines.mode = state.mines.mode === 'open' ? 'flag' : 'open';
                    updateToolbar();
                    saveMines();
                }
            }
        };
        document.addEventListener('keydown', onKey, true);

        state.cleanup = () => {
            saveMines();
            clearTimeout(longPressTimer);
            window.clearInterval(tick);
            board.removeEventListener('pointerdown', onPointerDown);
            board.removeEventListener('pointerup', onPointerUp);
            board.removeEventListener('pointercancel', onPointerCancel);
            board.removeEventListener('contextmenu', onContext);
            board.removeEventListener('click', onCellClick);
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('keydown', onMineViewKey, true);
        };

        function updateDifficultyButtons() {
            difficultyBar.querySelectorAll('.stgc-difficulty-btn').forEach(button => {
                button.classList.toggle('active', button.dataset.difficulty === state.mines.difficulty);
            });
        }

        function updateToolbar() {
            const s = state.mines;
            if (s.startedAt && !s.gameOver && !s.won) {
                s.time = Math.floor((Date.now() - s.startedAt) / 1000);
            }
            const status = s.gameOver ? '踩雷了' : s.won ? '通关啦' : '';
            timer.textContent = status ? `${status} · ${formatTime(s.time)}` : formatTime(s.time);
            mineCounter.textContent = `剩余雷 ${Math.max(0, s.mineCount - s.flags)}`;
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
                board.append(btn);
            });
            updateDifficultyButtons();
            updateToolbar();
        }

        updateDifficultyButtons();
        draw();
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
                if (merged >= 2048) { game.won = true; recordGameWin('2048'); }
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
            recordGameWin('sudoku');
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
        if (game.won) recordGameWin('sokoban');
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


    /* ==================== Gomoku ==================== */

    const GOMOKU_SIZE = 15;

    function newGomoku(mode = 'ai') {
        return {
            board: Array(GOMOKU_SIZE * GOMOKU_SIZE).fill(0),
            current: 1,
            winner: 0,
            over: false,
            mode,
            moves: 0,
            aiThinking: false,
        };
    }

    function gomokuXY(index) {
        return { x: index % GOMOKU_SIZE, y: Math.floor(index / GOMOKU_SIZE) };
    }

    function gomokuIndex(x, y) {
        return y * GOMOKU_SIZE + x;
    }

    function gomokuInBounds(x, y) {
        return x >= 0 && x < GOMOKU_SIZE && y >= 0 && y < GOMOKU_SIZE;
    }

    function gomokuCountDirection(game, x, y, dx, dy, player) {
        let count = 0;
        let nx = x + dx;
        let ny = y + dy;
        while (gomokuInBounds(nx, ny) && game.board[gomokuIndex(nx, ny)] === player) {
            count++;
            nx += dx;
            ny += dy;
        }
        return count;
    }

    function gomokuCheckWin(game, index, player) {
        const { x, y } = gomokuXY(index);
        return [[1, 0], [0, 1], [1, 1], [1, -1]].some(([dx, dy]) => {
            const total = 1
                + gomokuCountDirection(game, x, y, dx, dy, player)
                + gomokuCountDirection(game, x, y, -dx, -dy, player);
            return total >= 5;
        });
    }

    function gomokuCandidateCells(game) {
        const stones = [];
        game.board.forEach((v, i) => { if (v) stones.push(i); });
        if (!stones.length) return [gomokuIndex(7, 7)];

        const candidates = new Set();
        for (const index of stones) {
            const { x, y } = gomokuXY(index);
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const nx = x + dx, ny = y + dy;
                    if (gomokuInBounds(nx, ny) && game.board[gomokuIndex(nx, ny)] === 0) {
                        candidates.add(gomokuIndex(nx, ny));
                    }
                }
            }
        }
        return [...candidates];
    }

    function gomokuLineScore(game, index, player) {
        const opponent = player === 1 ? 2 : 1;
        const { x, y } = gomokuXY(index);
        let score = 0;
        const directions = [[1,0], [0,1], [1,1], [1,-1]];

        for (const [dx, dy] of directions) {
            let own = 1, open = 0, blocked = 0;
            let nx = x + dx, ny = y + dy;
            while (gomokuInBounds(nx, ny) && game.board[gomokuIndex(nx, ny)] === player) {
                own++; nx += dx; ny += dy;
            }
            if (gomokuInBounds(nx, ny) && game.board[gomokuIndex(nx, ny)] === 0) open++;
            else blocked++;

            nx = x - dx; ny = y - dy;
            while (gomokuInBounds(nx, ny) && game.board[gomokuIndex(nx, ny)] === player) {
                own++; nx -= dx; ny -= dy;
            }
            if (gomokuInBounds(nx, ny) && game.board[gomokuIndex(nx, ny)] === 0) open++;
            else blocked++;

            if (own >= 5) score += 100000;
            else if (own === 4 && open === 2) score += 12000;
            else if (own === 4 && open === 1) score += 3500;
            else if (own === 3 && open === 2) score += 1000;
            else if (own === 3 && open === 1) score += 220;
            else if (own === 2 && open === 2) score += 110;
            else if (own === 2 && open === 1) score += 25;
            else score += Math.max(1, own * 2 - blocked);
        }

        // 中心位置略有偏好，帮助开局更自然。
        const dist = Math.abs(x - 7) + Math.abs(y - 7);
        score += Math.max(0, 18 - dist);
        score += player === opponent ? 0 : 0;
        return score;
    }

    function gomokuWouldWin(game, index, player) {
        game.board[index] = player;
        const win = gomokuCheckWin(game, index, player);
        game.board[index] = 0;
        return win;
    }

    function chooseGomokuAIMove(game) {
        const candidates = gomokuCandidateCells(game);
        const ai = 2;
        const human = 1;

        // 先抢自己的必胜点，再堵玩家的必胜点。
        for (const index of candidates) if (gomokuWouldWin(game, index, ai)) return index;
        for (const index of candidates) if (gomokuWouldWin(game, index, human)) return index;

        let best = candidates[0];
        let bestScore = -Infinity;
        for (const index of candidates) {
            const attack = gomokuLineScore(game, index, ai);
            const defense = gomokuLineScore(game, index, human);
            const score = attack * 1.15 + defense * 1.05 + Math.random() * 5;
            if (score > bestScore) {
                bestScore = score;
                best = index;
            }
        }
        return best;
    }

    function gomokuPlace(game, index, player) {
        if (game.over || game.board[index] !== 0) return false;
        game.board[index] = player;
        game.moves++;
        if (gomokuCheckWin(game, index, player)) {
            game.winner = player;
            game.over = true;
            if (player === 1) recordGameWin('gomoku');
        } else if (game.board.every(Boolean)) {
            game.over = true;
            game.winner = 0;
        } else {
            game.current = player === 1 ? 2 : 1;
        }
        return true;
    }

    function renderGomoku(body) {
        state.gomoku = newGomoku('ai');

        const top = el('div', { class: 'stgc-game-toolbar' });
        const info = el('div', { class: 'stgc-game-info' });
        const status = el('span', { class: 'stgc-pill' });
        const mode = el('button', { class: 'stgc-btn stgc-btn-quiet', type: 'button' });
        const reset = el('button', { class: 'stgc-btn', type: 'button' });
        mode.textContent = '人机对战';
        reset.innerHTML = '<i class="fa-solid fa-rotate-right" aria-hidden="true"></i><span>重新开始</span>';
        info.append(status);
        top.append(info, mode, reset);

        const board = el('div', { class: 'gomoku-board', 'aria-label': '五子棋棋盘' });
        body.append(top, board, el('div', {
            class: 'stgc-game-hint',
            text: '默认与你对战本地 AI，不需要配置 API · 点击棋盘落子 · 可切换双人对战',
        }));

        const draw = () => {
            const game = state.gomoku;
            board.innerHTML = '';
            board.style.gridTemplateColumns = `repeat(${GOMOKU_SIZE}, minmax(0, 1fr))`;
            board.style.gridTemplateRows = `repeat(${GOMOKU_SIZE}, minmax(0, 1fr))`;
            for (let index = 0; index < game.board.length; index++) {
                const cell = el('button', {
                    class: 'gomoku-cell',
                    type: 'button',
                    'aria-label': `第 ${Math.floor(index / GOMOKU_SIZE) + 1} 行，第 ${index % GOMOKU_SIZE + 1} 列`,
                });
                if (game.board[index] === 1) cell.classList.add('black');
                else if (game.board[index] === 2) cell.classList.add('white');
                if (index === 112) cell.classList.add('center-star');
                cell.dataset.index = String(index);
                board.append(cell);
            }

            if (game.winner === 1) status.textContent = '你赢了 🎉';
            else if (game.winner === 2) status.textContent = 'AI 赢了';
            else if (game.over) status.textContent = '和棋';
            else if (game.aiThinking) status.textContent = 'AI 思考中…';
            else status.textContent = game.current === 1 ? '轮到你' : 'AI 回合';

            mode.textContent = game.mode === 'ai' ? '人机对战' : '双人对战';
        };

        const playAI = () => {
            const game = state.gomoku;
            if (game.mode !== 'ai' || game.over || game.current !== 2) return;
            game.aiThinking = true;
            draw();
            window.setTimeout(() => {
                // 切换模式/重新开始后，旧回合不能污染新棋盘。
                if (state.currentGame !== 'gomoku' || state.gomoku !== game) return;
                const move = chooseGomokuAIMove(game);
                game.aiThinking = false;
                gomokuPlace(game, move, 2);
                draw();
            }, 160);
        };

        board.addEventListener('click', event => {
            const cell = event.target.closest?.('.gomoku-cell');
            if (!cell) return;
            const game = state.gomoku;
            if (!game || game.over || game.aiThinking) return;
            if (game.mode === 'ai' && game.current !== 1) return;
            if (!gomokuPlace(game, Number(cell.dataset.index), game.current)) return;
            draw();
            playAI();
        });

        mode.addEventListener('click', () => {
            const next = state.gomoku.mode === 'ai' ? 'pvp' : 'ai';
            state.gomoku = newGomoku(next);
            draw();
        });
        reset.addEventListener('click', () => {
            state.gomoku = newGomoku(state.gomoku.mode);
            draw();
        });

        state.cleanup = () => {};
        draw();
    }


    /* ==================== 15 Puzzle ==================== */
    const PUZZLE15_KEY = 'silly-game:15-puzzle:v1';

    function puzzle15Solved(board) {
        for (let i = 0; i < board.length - 1; i++) if (board[i] !== i + 1) return false;
        return board[board.length - 1] === 0;
    }

    function puzzle15ValidMoves(size, index) {
        const x = index % size, y = Math.floor(index / size);
        const out = [];
        if (y > 0) out.push(index - size);
        if (y < size - 1) out.push(index + size);
        if (x > 0) out.push(index - 1);
        if (x < size - 1) out.push(index + 1);
        return out;
    }

    function puzzle15Shuffle(size) {
        const board = Array.from({ length: size * size }, (_, i) => i + 1);
        board[board.length - 1] = 0;
        let blank = board.length - 1;
        let prev = -1;
        const steps = Math.max(120, size * size * 30);
        for (let i = 0; i < steps; i++) {
            let moves = puzzle15ValidMoves(size, blank).filter(m => m !== prev);
            if (!moves.length) moves = puzzle15ValidMoves(size, blank);
            const target = moves[Math.floor(Math.random() * moves.length)];
            [board[blank], board[target]] = [board[target], board[blank]];
            prev = blank;
            blank = target;
        }
        if (puzzle15Solved(board)) return puzzle15Shuffle(size);
        return board;
    }

    function save15Puzzle() {
        try { localStorage.setItem(PUZZLE15_KEY, JSON.stringify(state.puzzle15)); } catch {}
    }

    function load15Puzzle() {
        try {
            const raw = localStorage.getItem(PUZZLE15_KEY);
            if (!raw) return null;
            const game = JSON.parse(raw);
            if (!game || !Array.isArray(game.board) || !Number.isInteger(game.size)) return null;
            return game;
        } catch { return null; }
    }

    function clear15PuzzleSave() {
        try { localStorage.removeItem(PUZZLE15_KEY); } catch {}
    }

    function new15Puzzle(size = 4) {
        return { size, board: puzzle15Shuffle(size), moves: 0, startedAt: Date.now(), time: 0, won: false };
    }

    function move15Puzzle(direction) {
        const game = state.puzzle15;
        if (!game || game.won) return false;
        const zero = game.board.indexOf(0);
        const x = zero % game.size, y = Math.floor(zero / game.size);
        let target = -1;
        if (direction === 'up' && y > 0) target = zero - game.size;
        if (direction === 'down' && y < game.size - 1) target = zero + game.size;
        if (direction === 'left' && x > 0) target = zero - 1;
        if (direction === 'right' && x < game.size - 1) target = zero + 1;
        if (target < 0) return false;
        [game.board[zero], game.board[target]] = [game.board[target], game.board[zero]];
        game.moves++;
        game.time = Math.floor((Date.now() - game.startedAt) / 1000);
        game.won = puzzle15Solved(game.board);
        if (game.won) recordGameWin('puzzle15');
        if (game.won) game.time = Math.floor((Date.now() - game.startedAt) / 1000);
        save15Puzzle();
        return true;
    }

    function render15Puzzle(body) {
        cleanupGame();
        state.puzzle15 = load15Puzzle() || new15Puzzle(4);
        save15Puzzle();

        const top = el('div', { class: 'stgc-status-row' });
        const info = el('div', { class: 'stgc-status-text' });
        const size = el('select', { class: 'stgc-select', title: '棋盘大小' });
        [[3,'3×3'],[4,'4×4'],[5,'5×5']].forEach(([v,t]) => {
            const o=el('option',{value:String(v),text:t}); size.append(o);
        });
        size.value = String(state.puzzle15.size);
        const reset = el('button',{class:'stgc-btn',type:'button'});
        reset.innerHTML='<i class="fa-solid fa-rotate-right"></i><span>重新开始</span>';
        const board = el('div',{class:'puzzle15-board'});
        const controls = el('div',{class:'game-direction-controls stgc-15-controls'});
        const makeBtn=(text,d)=>{const b=el('button',{class:'direction-btn',type:'button',text, 'aria-label':d}); b.addEventListener('click',()=>{move15Puzzle(d);draw();}); return b;};
        [['↑','up'],['←','left'],['↓','down'],['→','right']].forEach(([t,d])=>controls.append(makeBtn(t,d)));
        top.append(info,size,reset);
        body.append(top,board,controls,el('div',{class:'stgc-game-hint',text:'点击相邻数字或使用方向键移动空格 · 页面刷新会自动保存'}));

        const draw=()=>{
            const g=state.puzzle15;
            board.innerHTML='';
            board.style.gridTemplateColumns=`repeat(${g.size},1fr)`;
            info.textContent=g.won?`🎉 完成！${formatTime(g.time)} · ${g.moves} 步`:`${g.size}×${g.size} · ${formatTime(Math.floor((Date.now()-g.startedAt)/1000))} · ${g.moves} 步`;
            g.board.forEach((v,i)=>{
                const tile=el('div',{class:`puzzle15-tile${v===0?' empty':''}`,text:v?String(v):''});
                if (v) tile.addEventListener('click',()=>{
                    const zero=g.board.indexOf(0); if (puzzle15ValidMoves(g.size,zero).includes(i)) {
                        if (i===zero-g.size) move15Puzzle('up');
                        else if (i===zero+g.size) move15Puzzle('down');
                        else if (i===zero-1) move15Puzzle('left');
                        else if (i===zero+1) move15Puzzle('right');
                        draw();
                    }
                });
                board.append(tile);
            });
        };
        const onKey=e=>{if(state.currentGame!=='puzzle15')return;const m={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'}[e.key];if(!m)return;e.preventDefault();e.stopPropagation();move15Puzzle(m);draw();};
        document.addEventListener('keydown',onKey,true);
        size.addEventListener('change',()=>{state.puzzle15=new15Puzzle(Number(size.value));clear15PuzzleSave();save15Puzzle();draw();});
        reset.addEventListener('click',()=>{state.puzzle15=new15Puzzle(state.puzzle15.size);clear15PuzzleSave();save15Puzzle();draw();});
        const timer=window.setInterval(draw,1000);
        state.cleanup=()=>{document.removeEventListener('keydown',onKey,true);clearInterval(timer);save15Puzzle();};
        draw();
    }

    /* ==================== Tetris ==================== */
    const TETRIS_KEY='silly-game:tetris:v1';
    const TETROMINOES={
        I:[[0,0],[1,0],[2,0],[3,0]],O:[[0,0],[1,0],[0,1],[1,1]],T:[[1,0],[0,1],[1,1],[2,1]],S:[[1,0],[2,0],[0,1],[1,1]],Z:[[0,0],[1,0],[1,1],[2,1]],J:[[0,0],[0,1],[1,1],[2,1]],L:[[2,0],[0,1],[1,1],[2,1]]
    };
    const TETRIS_COLORS={I:'I',O:'O',T:'T',S:'S',Z:'Z',J:'J',L:'L'};

    function tetrisBag(){const a=Object.keys(TETROMINOES);for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
    function tetrisPiece(type){return {type, x:3, y:0, rot:0};}
    function tetrisCells(piece){
        const base=TETROMINOES[piece.type];
        let cells=base.map(([x,y])=>[x,y]);
        for(let r=0;r<piece.rot%4;r++) cells=cells.map(([x,y])=>[-y,x]);
        const minX=Math.min(...cells.map(c=>c[0])), minY=Math.min(...cells.map(c=>c[1]));
        return cells.map(([x,y])=>[x-minX,y-minY]);
    }
    function tetrisCanPlace(g,piece,dx=0,dy=0,rot=piece.rot){
        const test={...piece,rot};
        return tetrisCells(test).every(([x,y])=>{const nx=test.x+x+dx,ny=test.y+y+dy;return nx>=0&&nx<10&&ny>=0&&ny<20&&(g.board[ny]?.[nx]||0)===0;});
    }
    function tetrisSpawn(g){
        if(!g.queue.length)g.queue.push(...tetrisBag());
        const type=g.queue.shift();g.queue.push(...(g.queue.length<3?tetrisBag():[]));g.current=tetrisPiece(type);g.current.x=3;g.current.y=0;g.current.rot=0;
        if(!tetrisCanPlace(g,g.current))g.over=true;
    }
    function tetrisNew(){const g={board:Array.from({length:20},()=>Array(10).fill(0)),queue:[],current:null,score:0,lines:0,level:1,over:false,paused:false,dropTick:0,startedAt:Date.now()};g.queue.push(...tetrisBag(),...tetrisBag());tetrisSpawn(g);return g;}
    function saveTetris(){try{localStorage.setItem(TETRIS_KEY,JSON.stringify(state.tetris));}catch{}}
    function loadTetris(){try{const x=JSON.parse(localStorage.getItem(TETRIS_KEY)||'null');if(x?.board?.length===20)return x;}catch{}return null;}
    function clearTetris(){try{localStorage.removeItem(TETRIS_KEY);}catch{}}
    function tetrisLock(g){
        for(const [x,y] of tetrisCells(g.current)){const nx=g.current.x+x,ny=g.current.y+y;if(ny>=0&&ny<20)g.board[ny][nx]=g.current.type;}
        let cleared=0;
        for(let y=19;y>=0;y--){if(g.board[y].every(Boolean)){g.board.splice(y,1);g.board.unshift(Array(10).fill(0));cleared++;y++;}}
        if(cleared){const points=[0,100,300,500,800][cleared]*g.level;g.score+=points;g.lines+=cleared;g.level=1+Math.floor(g.lines/10);}
        tetrisSpawn(g);
    }
    function tetrisMove(dir){const g=state.tetris;if(!g||g.over||g.paused)return false;let moved=false;if(dir==='left'&&tetrisCanPlace(g,g.current,-1,0)){g.current.x--;moved=true;}if(dir==='right'&&tetrisCanPlace(g,g.current,1,0)){g.current.x++;moved=true;}if(dir==='down'){if(tetrisCanPlace(g,g.current,0,1)){g.current.y++;g.score++;moved=true;}else{tetrisLock(g);moved=true;}}if(dir==='drop'){let d=0;while(tetrisCanPlace(g,g.current,0,d+1))d++;g.current.y+=d;g.score+=d*2;tetrisLock(g);moved=true;}if(dir==='rotate'){let r=(g.current.rot+1)%4;if(tetrisCanPlace(g,g.current,0,0,r)){g.current.rot=r;moved=true;}else for(const kick of [-1,1,-2,2])if(tetrisCanPlace(g,g.current,kick,0,r)){g.current.x+=kick;g.current.rot=r;moved=true;break;}}if(moved)saveTetris();return moved;}

    function renderTetris(body){
        cleanupGame(); state.tetris=loadTetris()||tetrisNew(); saveTetris();
        const top=el('div',{class:'stgc-status-row'}),info=el('div',{class:'stgc-status-text'}),reset=el('button',{class:'stgc-btn',type:'button'}),pause=el('button',{class:'stgc-btn',type:'button'});reset.innerHTML='<i class="fa-solid fa-rotate-right"></i><span>重新开始</span>';pause.innerHTML='<i class="fa-solid fa-pause"></i><span>暂停</span>';top.append(info,pause,reset);
        const wrap=el('div',{class:'tetris-wrap'}),board=el('div',{class:'tetris-board'}),side=el('div',{class:'tetris-side'}),nextTitle=el('div',{class:'stgc-side-title',text:'下一个'}),next=el('div',{class:'tetris-next'});side.append(nextTitle,next);wrap.append(board,side);
        const controls=el('div',{class:'tetris-controls'});
        const add=(text,fn,cls='')=>{const b=el('button',{class:`direction-btn ${cls}`,type:'button',text});b.addEventListener('click',fn);controls.append(b);return b;};
        add('↺',()=>tetrisMove('rotate'),'tetris-rotate');add('←',()=>tetrisMove('left'));add('↓',()=>tetrisMove('down'));add('→',()=>tetrisMove('right'));add('⤓',()=>tetrisMove('drop'),'tetris-drop');
        body.append(top,wrap,controls,el('div',{class:'stgc-game-hint',text:'← → 移动 · ↓ 加速 · ↺ 旋转 · ⤓ 直接落底 · 刷新自动保存'}));
        const draw=()=>{
            const g=state.tetris;board.innerHTML='';const cells=Array.from({length:20},()=>Array(10).fill(''));for(let y=0;y<20;y++)for(let x=0;x<10;x++)if(g.board[y][x])cells[y][x]=g.board[y][x];
            if(g.current&&!g.over)for(const [x,y] of tetrisCells(g.current)){const nx=g.current.x+x,ny=g.current.y+y;if(ny>=0&&ny<20&&nx>=0&&nx<10)cells[ny][nx]=g.current.type;}
            for(let y=0;y<20;y++)for(let x=0;x<10;x++){const c=el('div',{class:`tetris-cell${cells[y][x]?' filled':''}`});if(cells[y][x])c.dataset.t=cells[y][x];board.append(c);}info.textContent=g.over?`游戏结束 · ${g.score} 分`:g.paused?`已暂停 · ${g.score} 分`:`${g.score} 分 · ${g.lines} 行 · Lv.${g.level}`;pause.innerHTML=g.paused?'<i class="fa-solid fa-play"></i><span>继续</span>':'<i class="fa-solid fa-pause"></i><span>暂停</span>';next.innerHTML='';const p=tetrisPiece(g.queue[0]||'I');for(const [x,y] of tetrisCells(p)){const n=el('div',{class:'tetris-mini-cell',text:''});n.style.gridColumn=String(x+1);n.style.gridRow=String(y+1);n.dataset.t=p.type;next.append(n);}
        };
        const onKey=e=>{if(state.currentGame!=='tetris')return;const m={ArrowLeft:'left',ArrowRight:'right',ArrowDown:'down',' ':'drop',ArrowUp:'rotate'}[e.key];if(!m)return;e.preventDefault();e.stopPropagation();if(e.key===' ')tetrisMove('drop');else tetrisMove(m);draw();};document.addEventListener('keydown',onKey,true);
        pause.addEventListener('click',()=>{state.tetris.paused=!state.tetris.paused;saveTetris();draw();});reset.addEventListener('click',()=>{clearTetris();state.tetris=tetrisNew();saveTetris();draw();});
        const timer=window.setInterval(()=>{const g=state.tetris;if(!g||g.over||g.paused)return;const speed=Math.max(90,800-(g.level-1)*65);g.dropTick++;if(g.dropTick>=Math.max(1,Math.floor(speed/90))){g.dropTick=0;if(!tetrisCanPlace(g,g.current,0,1))tetrisLock(g);else g.current.y++;saveTetris();}draw();},90);
        state.cleanup=()=>{document.removeEventListener('keydown',onKey,true);clearInterval(timer);saveTetris();};draw();
    }

    /* ==================== Water Sort ==================== */

    const WATER_SORT_KEY = 'silly-game:water-sort:v2';
    const WATER_COLORS = [
        '#ef767a', '#5dade2', '#58d68d', '#f5b041', '#af7ac5',
        '#48c9b0', '#ec7063', '#f7dc6f', '#95a5a6', '#ca6f1e',
        '#7d7cff', '#9ccc65', '#ff8a65', '#9575cd', '#4db6ac',
        '#f06292', '#64b5f6', '#81c784', '#ffca6b', '#ba68c8',
    ];

    function waterCloneTubes(tubes) {
        return tubes.map(t => t.slice());
    }

    function waterTopRun(tube) {
        if (!tube.length) return { color: null, count: 0 };
        const color = tube[tube.length - 1];
        let count = 0;
        for (let i = tube.length - 1; i >= 0 && tube[i] === color; i--) count++;
        return { color, count };
    }

    function waterCanPour(game, from, to) {
        if (from === to) return false;
        const src = game.tubes[from];
        const dst = game.tubes[to];
        if (!src.length || dst.length >= game.capacity) return false;
        if (!dst.length) return true;
        return dst[dst.length - 1] === src[src.length - 1];
    }

    function waterPour(game, from, to) {
        if (!waterCanPour(game, from, to)) return 0;
        const src = game.tubes[from];
        const dst = game.tubes[to];
        const run = waterTopRun(src);
        const amount = Math.min(run.count, game.capacity - dst.length);
        for (let i = 0; i < amount; i++) dst.push(src.pop());
        game.moves++;
        return amount;
    }

    function waterSolved(game) {
        return game.tubes.every(tube => {
            if (!tube.length) return true;
            return tube.length === game.capacity && tube.every(v => v === tube[0]);
        });
    }

    function waterShuffleArray(arr, rand) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    function waterLevelConfig(level, endless = false) {
        const lv = Math.max(1, Number(level) || 1);
        // 关卡越往后颜色越多，瓶子也会跟着增加；无尽模式持续增长，达到上限后继续增加扰动强度。
        const colorCount = Math.min(16, 4 + Math.floor((lv - 1) / 2));
        const emptyCount = lv >= 13 ? 3 : 2;
        const scrambleSteps = Math.min(
            260,
            28 + lv * 9 + (endless ? Math.min(lv * 2, 90) : 0),
        );
        return {
            level: lv,
            capacity: 4,
            colorCount,
            emptyCount,
            tubeCount: colorCount + emptyCount,
            scrambleSteps,
        };
    }

    function waterGenerateLevel(level, endless = false) {
        const cfg = waterLevelConfig(level, endless);
        const seedBase = `${endless ? 'E' : 'L'}:${cfg.level}:${Date.now()}:${Math.random()}`;
        let seed = 2166136261;
        for (let i = 0; i < seedBase.length; i++) {
            seed ^= seedBase.charCodeAt(i);
            seed = Math.imul(seed, 16777619);
        }
        const rand = () => {
            seed += 0x6D2B79F5;
            let t = seed;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        // 从“已完成”状态做逆向操作打乱。
        // 每一步都对应一个未来可以合法还原的倒水动作，因此生成的局面天然可解。
        const tubes = Array.from({ length: cfg.tubeCount }, () => []);
        for (let c = 0; c < cfg.colorCount; c++) {
            tubes[c] = [c, c, c, c];
        }

        let previous = null;
        let useful = 0;
        for (let step = 0; step < cfg.scrambleSteps; step++) {
            const candidates = [];
            for (let from = 0; from < cfg.colorCount + cfg.emptyCount; from++) {
                const src = tubes[from];
                if (!src.length) continue;
                const run = waterTopRun(src).count;
                const maxMove = Math.min(run, cfg.capacity,);
                for (let amount = 1; amount <= maxMove; amount++) {
                    // 逆向：把 from 顶部 amount 格移到 to；目标只要求有空间。
                    for (let to = 0; to < tubes.length; to++) {
                        if (to === from) continue;
                        if (tubes[to].length + amount > cfg.capacity) continue;
                        if (previous && previous.from === to && previous.to === from && previous.amount === amount) continue;
                        candidates.push({ from, to, amount });
                    }
                }
            }
            if (!candidates.length) break;
            const move = candidates[Math.floor(rand() * candidates.length)];
            const moved = tubes[move.to].length;
            for (let i = 0; i < move.amount; i++) tubes[move.to].push(tubes[move.from].pop());
            previous = move;

            if (move.amount > 0 && moved > 0) useful++;
        }

        // 防止极少数极简/过早完成的情况，再做一轮不同随机种子的生成。
        if (waterSolved({ tubes, capacity: cfg.capacity }) || useful < Math.max(8, cfg.colorCount)) {
            return waterGenerateLevel(level + (endless ? 1 : 0), endless);
        }

        return {
            level: cfg.level,
            capacity: cfg.capacity,
            colorCount: cfg.colorCount,
            emptyCount: cfg.emptyCount,
            endless: !!endless,
            tubes: waterCloneTubes(tubes),
            selected: -1,
            moves: 0,
            history: [],
            won: false,
            startedAt: Date.now(),
        };
    }

    function waterStartLevel(level, endless = false) {
        return waterGenerateLevel(level, endless);
    }

    function waterSave(game) {
        try {
            localStorage.setItem(WATER_SORT_KEY, JSON.stringify(game));
        } catch { /* localStorage unavailable */ }
    }

    function waterLoad() {
        try {
            const saved = JSON.parse(localStorage.getItem(WATER_SORT_KEY) || 'null');
            if (!saved?.tubes || !Array.isArray(saved.tubes)) return null;
            if (!Number.isInteger(saved.capacity) || saved.capacity !== 4) return null;
            if (!saved.tubes.every(t => Array.isArray(t) && t.length <= 4)) return null;
            const tubeCount = saved.tubes.length;
            const colorCount = Math.max(1, Number(saved.colorCount) || Math.max(1, tubeCount - 2));
            return {
                level: Math.max(1, Number(saved.level) || 1),
                capacity: 4,
                colorCount,
                emptyCount: Math.max(2, Number(saved.emptyCount) || 2),
                endless: !!saved.endless,
                tubes: saved.tubes.map(t => t.slice()),
                selected: -1,
                moves: Math.max(0, Number(saved.moves) || 0),
                history: Array.isArray(saved.history) ? saved.history.slice(-80).map(waterCloneTubes) : [],
                won: !!saved.won,
                startedAt: Number(saved.startedAt) || Date.now(),
            };
        } catch {
            return null;
        }
    }

    function waterClearSave() {
        try { localStorage.removeItem(WATER_SORT_KEY); } catch { /* ignore */ }
    }

    function waterFormatMode(game) {
        return game.endless ? '无尽模式' : `第 ${game.level} 关`;
    }

    function waterStartFresh(mode, level = 1) {
        return waterStartLevel(level, mode === 'endless');
    }

    function renderWaterSort(body) {
        state.waterSort = waterLoad() || waterStartFresh('levels', 1);
        const top = el('div', { class: 'stgc-game-toolbar' });
        const info = el('div', { class: 'stgc-game-info' });
        const modePill = el('span', { class: 'stgc-pill' });
        const movePill = el('span', { class: 'stgc-pill' });
        const bottlePill = el('span', { class: 'stgc-pill' });
        info.append(modePill, movePill, bottlePill);

        const undo = el('button', { class: 'stgc-btn', type: 'button', text: '↶ 撤销' });
        const reset = el('button', { class: 'stgc-btn', type: 'button', text: '重新开始' });
        top.append(info, undo, reset);

        const modeRow = el('div', { class: 'water-level-row water-mode-row' });
        const modeSelect = el('select', { class: 'stgc-btn stgc-select', 'aria-label': '倒水瓶模式' });
        modeSelect.append(new Option('关卡模式', 'levels'));
        modeSelect.append(new Option('无尽模式', 'endless'));
        modeRow.append(modeSelect);

        const levelRow = el('div', { class: 'water-level-row' });
        const levelSelect = el('select', { class: 'stgc-btn stgc-select', 'aria-label': '关卡' });
        for (let i = 1; i <= 60; i++) levelSelect.append(new Option(`第 ${i} 关`, String(i)));
        levelRow.append(levelSelect);

        const board = el('div', { class: 'water-sort-board', 'aria-label': '倒水瓶棋盘' });
        const hint = el('div', {
            class: 'stgc-game-hint',
            text: '点一个瓶子选中，再点目标瓶倒水。每两关增加一种颜色；无尽模式会一直生成新局。刷新后自动保存。',
        });
        body.append(top, modeRow, levelRow, board, hint);

        function commit(newTubes) {
            const game = state.waterSort;
            game.history.push(waterCloneTubes(game.tubes));
            if (game.history.length > 80) game.history.shift();
            game.tubes = waterCloneTubes(newTubes);
            game.moves++;
            game.selected = -1;
            game.won = waterSolved(game);
            if (game.won) recordGameWin('waterSort');
            waterSave(game);
            draw();
        }

        function clickTube(index) {
            const game = state.waterSort;
            if (game.won) return;
            if (game.selected < 0) {
                if (!game.tubes[index].length) return;
                game.selected = index;
                draw();
                return;
            }
            if (game.selected === index) {
                game.selected = -1;
                draw();
                return;
            }
            if (waterCanPour(game, game.selected, index)) {
                const clone = waterCloneTubes(game.tubes);
                const temp = { tubes: clone, capacity: game.capacity, moves: game.moves };
                waterPour(temp, game.selected, index);
                commit(clone);
                return;
            }
            if (game.tubes[index].length) {
                game.selected = index;
                draw();
            }
        }

        undo.addEventListener('click', () => {
            const game = state.waterSort;
            if (!game.history.length || game.won) return;
            game.tubes = game.history.pop();
            game.moves = Math.max(0, game.moves - 1);
            game.selected = -1;
            game.won = false;
            waterSave(game);
            draw();
        });

        reset.addEventListener('click', () => {
            const game = state.waterSort;
            state.waterSort = waterStartFresh(game.endless ? 'endless' : 'levels', game.level);
            waterSave(state.waterSort);
            draw();
        });

        modeSelect.addEventListener('change', () => {
            const mode = modeSelect.value;
            state.waterSort = waterStartFresh(mode, 1);
            waterSave(state.waterSort);
            draw();
        });

        levelSelect.addEventListener('change', () => {
            const current = state.waterSort;
            const level = Number(levelSelect.value) || 1;
            state.waterSort = waterStartFresh(current.endless ? 'endless' : 'levels', level);
            waterSave(state.waterSort);
            draw();
        });

        function goNextLevel() {
            const game = state.waterSort;
            const nextLevel = game.level + 1;
            state.waterSort = waterStartFresh(game.endless ? 'endless' : 'levels', nextLevel);
            waterSave(state.waterSort);
            draw();
        }

        function draw() {
            const game = state.waterSort;
            board.innerHTML = '';
            modeSelect.value = game.endless ? 'endless' : 'levels';
            levelSelect.value = String(Math.min(60, game.level));
            levelSelect.disabled = game.endless;

            modePill.textContent = game.won ? `${waterFormatMode(game)} · 通关！` : waterFormatMode(game);
            movePill.textContent = `步数 ${game.moves}`;
            bottlePill.textContent = `${game.tubes.length} 瓶 · ${game.colorCount} 色`;

            for (let index = 0; index < game.tubes.length; index++) {
                const tube = game.tubes[index];
                const wrap = el('div', { class: `water-tube-wrap${game.selected === index ? ' selected' : ''}` });
                const tubeEl = el('div', { class: 'water-tube' });
                tube.forEach((colorIndex, layer) => {
                    const liquid = el('div', { class: 'water-liquid' });
                    liquid.style.setProperty('--water-color', WATER_COLORS[colorIndex % WATER_COLORS.length]);
                    liquid.style.bottom = `${layer * 25}%`;
                    tubeEl.append(liquid);
                });
                if (!tube.length) tubeEl.classList.add('empty');
                wrap.append(tubeEl, el('div', { class: 'water-tube-number', text: String(index + 1) }));
                wrap.addEventListener('click', () => clickTube(index));
                board.append(wrap);
            }

            if (game.won) {
                const next = el('button', { class: 'stgc-btn water-next', type: 'button', text: game.endless ? `继续 · 第 ${game.level + 1} 关` : `下一关 · ${game.level + 1}` });
                next.addEventListener('click', goNextLevel);
                board.append(next);
            }
        }

        state.cleanup = () => { waterSave(state.waterSort); };
        draw();
    }


    /* ==================== 小农场 ==================== */
    function renderFarm(body) {
        cleanupGame();
        state.farm = farmLoad() || farmDefaultState();
        if (!farmIsUnlocked(state.farm.selectedCrop)) state.farm.selectedCrop = 'carrot';
        farmSave();

        const top = el('div', { class: 'stgc-game-toolbar farm-top' });
        const info = el('div', { class: 'stgc-game-info farm-info' });
        const coinPill = el('span', { class: 'stgc-pill' });
        const unlockPill = el('span', { class: 'stgc-pill' });
        info.append(coinPill, unlockPill);
        const seedHint = el('div', { class: 'stgc-game-hint farm-seed-hint', text: '先选种子，再点空地种下。点已种下的土地，可以浇水、施肥或收获。作物会在你关闭游戏时继续生长。' });
        top.append(info);

        const seedRow = el('div', { class: 'farm-seed-row' });
        const field = el('div', { class: 'farm-field', 'aria-label': '农场土地' });
        const actionRow = el('div', { class: 'farm-actions' });
        const selectionText = el('div', { class: 'farm-selection-text', text: '请选择一块土地' });
        const waterBtn = el('button', { class: 'stgc-btn farm-action-btn', type: 'button' });
        waterBtn.innerHTML = '<i class="fa-solid fa-droplet" aria-hidden="true"></i><span>浇水</span>';
        const feedBtn = el('button', { class: 'stgc-btn farm-action-btn', type: 'button' });
        feedBtn.innerHTML = '<i class="fa-solid fa-seedling" aria-hidden="true"></i><span>施肥</span>';
        const harvestBtn = el('button', { class: 'stgc-btn farm-action-btn farm-harvest-btn', type: 'button' });
        harvestBtn.innerHTML = '<i class="fa-solid fa-basket-shopping" aria-hidden="true"></i><span>收获</span>'; 
        actionRow.append(selectionText, waterBtn, feedBtn, harvestBtn);

        const cropNote = el('div', { class: 'farm-crop-note' });
        body.append(top, seedRow, seedHint, field, actionRow, cropNote);

        let selectedPlot = -1;
        const farmEffects = new Map();

        function showFarmEffect(index, kind) {
            const until = Date.now() + 1450;
            farmEffects.set(index, { kind, until });
            drawField();
            window.setTimeout(() => {
                const current = farmEffects.get(index);
                if (current && current.until <= Date.now()) {
                    farmEffects.delete(index);
                    drawField();
                }
            }, 1500);
        }

        function drawSeedRow() {
            seedRow.innerHTML = '';
            for (const [id, crop] of Object.entries(FARM_CROPS)) {
                const unlocked = farmIsUnlocked(id);
                const button = el('button', { class: `farm-seed-card${state.farm.selectedCrop === id ? ' selected' : ''}${unlocked ? '' : ' locked'}`, type: 'button' });
                button.innerHTML = unlocked
                    ? `<span class="farm-seed-visual farm-crop-${id}" aria-hidden="true"></span><span class="farm-seed-name">${crop.name}</span><span class="farm-seed-price">种子 ${crop.seedCost} · 收获 +${crop.sell}</span>`
                    : `<span class="farm-seed-lock" aria-hidden="true"><i class="fa-solid fa-lock"></i></span><span class="farm-seed-name">未解锁</span><span class="farm-seed-price">赢下${FARM_GAME_NAMES[crop.unlock] || '小游戏'}</span>`;
                button.disabled = !unlocked;
                button.addEventListener('click', () => {
                    state.farm.selectedCrop = id;
                    drawSeedRow();
                    drawSelection();
                    farmSave();
                });
                seedRow.append(button);
            }
            const unlockedCount = Object.keys(FARM_CROPS).filter(farmIsUnlocked).length;
            unlockPill.textContent = `作物 ${unlockedCount}/${Object.keys(FARM_CROPS).length}`;
        }

        function drawSelection() {
            const game = state.farm;
            if (selectedPlot < 0 || !game.plots[selectedPlot]) {
                selectionText.textContent = `当前种子：${FARM_CROPS[game.selectedCrop].name}`;
                waterBtn.disabled = true;
                feedBtn.disabled = true;
                harvestBtn.disabled = true;
                cropNote.textContent = '空地直接点一下就能种下当前选中的种子。';
                return;
            }
            const plot = game.plots[selectedPlot];
            const crop = FARM_CROPS[plot.crop];
            const stage = farmStage(plot);
            selectionText.textContent = `第 ${selectedPlot + 1} 块 · ${crop.name} · ${stage.text}`;
            waterBtn.disabled = !!plot.watered || stage.key === 'ripe';
            feedBtn.disabled = !!plot.fertilized || stage.key === 'ripe';
            harvestBtn.disabled = stage.key !== 'ripe';
            cropNote.textContent = `成长进度 ${(farmGrowth(plot) * 100).toFixed(0)}% · ${farmFormatTimeLeft(plot)}${plot.watered ? ' · 已浇水' : ''}${plot.fertilized ? ' · 已施肥' : ''}`;
        }

        function plantPlot(index) {
            const game = state.farm;
            const cropId = game.selectedCrop;
            const crop = FARM_CROPS[cropId];
            if (!farmIsUnlocked(cropId) || game.plots[index]) return;
            if (game.coins < crop.seedCost) {
                notify(`种子不够买啦，需要 ${crop.seedCost} 金币。`, 'Silly Farm');
                return;
            }
            game.coins -= crop.seedCost;
            game.plots[index] = {
                crop: cropId,
                plantedAt: Date.now(),
                watered: false,
                fertilized: false,
            };
            selectedPlot = index;
            farmSave();
            draw();
        }

        function waterSelected() {
            const plot = state.farm.plots[selectedPlot];
            if (!plot || plot.watered || farmStage(plot).key === 'ripe') return;
            const effectIndex = selectedPlot;
            plot.watered = true;
            farmSave();
            showFarmEffect(effectIndex, 'water');
            drawSelection();
            drawInfo();
            drawSeedRow();
        }

        function fertilizeSelected() {
            const plot = state.farm.plots[selectedPlot];
            if (!plot || plot.fertilized || farmStage(plot).key === 'ripe') return;
            const effectIndex = selectedPlot;
            plot.fertilized = true;
            farmSave();
            showFarmEffect(effectIndex, 'fertilizer');
            drawSelection();
            drawInfo();
            drawSeedRow();
        }

        function harvestSelected() {
            const game = state.farm;
            const plot = game.plots[selectedPlot];
            if (!plot || farmStage(plot).key !== 'ripe') return;
            const crop = FARM_CROPS[plot.crop];
            game.coins += crop.sell;
            game.harvested++;
            game.plots[selectedPlot] = null;
            selectedPlot = -1;
            farmSave();
            notify(`收获了 ${crop.name}！+${crop.sell} 金币`, 'Silly Farm');
            draw();
        }

        waterBtn.addEventListener('click', waterSelected);
        feedBtn.addEventListener('click', fertilizeSelected);
        harvestBtn.addEventListener('click', harvestSelected);

        function drawField() {
            field.innerHTML = '';
            state.farm.plots.forEach((plot, index) => {
                const tile = el('button', { class: `farm-plot${selectedPlot === index ? ' selected' : ''}${plot ? '' : ' empty'}`, type: 'button' });
                if (!plot) {
                    tile.innerHTML = '<span class="farm-plot-icon" aria-hidden="true"><i class="fa-solid fa-plus"></i></span><span class="farm-plot-label">空地</span>';
                } else {
                    const crop = FARM_CROPS[plot.crop];
                    const stage = farmStage(plot);
                    const progress = Math.round(farmGrowth(plot) * 100);
                    const effect = farmEffects.get(index);
                    const effectKind = effect?.kind;
                    if (effect && effect.until <= Date.now()) farmEffects.delete(index);
                    const activeEffect = farmEffects.get(index);
                    tile.innerHTML = `<span class="farm-plant-icon farm-crop-${plot.crop} farm-stage-${stage.key}" aria-hidden="true"><span class="farm-plant-art"><span class="farm-plant-leaves"></span><span class="farm-plant-fruit"></span></span></span><span class="farm-plant-name">${crop.name}</span><span class="farm-progress"><span style="width:${progress}%"></span></span><span class="farm-plant-meta">${stage.text} · ${farmFormatTimeLeft(plot)}</span>${activeEffect ? `<span class="farm-action-bubble farm-action-${activeEffect.kind}" aria-hidden="true"><span class="farm-bubble-mark"></span><span>${activeEffect.kind === 'water' ? '水' : '肥'}</span></span>` : ''}`;
                    if (plot.watered) tile.classList.add('watered');
                    if (plot.fertilized) tile.classList.add('fertilized');
                    if (stage.key === 'ripe') tile.classList.add('ripe');
                }
                tile.addEventListener('click', () => {
                    if (!state.farm.plots[index]) {
                        plantPlot(index);
                    } else {
                        selectedPlot = selectedPlot === index ? -1 : index;
                        drawSelection();
                        drawField();
                    }
                });
                field.append(tile);
            });
        }

        function drawInfo() {
            coinPill.textContent = `金币 ${state.farm.coins}`;
        }

        function draw() {
            drawInfo();
            drawSeedRow();
            drawField();
            drawSelection();
        }

        // 让其他小游戏胜利时，可以即时把刚解锁的作物显示在当前农场里。
        refreshFarmSeedRow = drawSeedRow;

        const timer = window.setInterval(() => {
            if (state.currentGame !== 'farm' || !state.farm) return;
            drawField();
            drawSelection();
        }, 1000);

        state.cleanup = () => {
            window.clearInterval(timer);
            farmSave();
            refreshFarmSeedRow = null;
        };

        draw();
    }

    /* ==================== Go ==================== */
    const GO_DEFAULT_SIZE = 13;
    const GO_SIZE_OPTIONS = [9, 13, 19];
    const GO_KEY = 'silly-game:go:v2';

    function goIndex(size, x, y){ return y * size + x; }
    function goXY(size, i){ return [i % size, Math.floor(i / size)]; }
    function goNeighbors(size, i){
        const [x,y] = goXY(size, i), a = [];
        if (x > 0) a.push(i - 1);
        if (x < size - 1) a.push(i + 1);
        if (y > 0) a.push(i - size);
        if (y < size - 1) a.push(i + size);
        return a;
    }
    function goCloneBoard(b){ return b.slice(); }
    function goGroup(size, board, start){
        const color = board[start];
        if (!color) return { stones: [], liberties: new Set() };
        const stones = [], libs = new Set(), seen = new Set([start]), q = [start];
        while (q.length){
            const i = q.pop();
            stones.push(i);
            for (const n of goNeighbors(size, i)){
                if (board[n] === 0) libs.add(n);
                else if (board[n] === color && !seen.has(n)){
                    seen.add(n);
                    q.push(n);
                }
            }
        }
        return { stones, liberties: libs };
    }
    function goRemoveGroup(board, group){ group.stones.forEach(i => board[i] = 0); }
    function goStarPoints(size){
        if (size === 9) return [[2,2],[6,2],[4,4],[2,6],[6,6]];
        if (size === 13) return [[3,3],[9,3],[6,6],[3,9],[9,9]];
        return [[3,3],[9,3],[15,3],[3,9],[9,9],[15,9],[3,15],[9,15],[15,15]];
    }
    function goMove(game, index, player){
        const size = game.size;
        if (game.over || game.board[index] !== 0 || player !== game.turn) return false;
        const previousKey = game.board.join('');
        const next = goCloneBoard(game.board);
        next[index] = player;
        const opponent = player === 1 ? 2 : 1;
        let captured = 0;

        for (const n of goNeighbors(size, index)){
            if (next[n] !== opponent) continue;
            const group = goGroup(size, next, n);
            if (group.liberties.size === 0){
                captured += group.stones.length;
                goRemoveGroup(next, group);
            }
        }

        const own = goGroup(size, next, index);
        if (own.liberties.size === 0 && captured === 0) return false;

        const nextKey = next.join('');
        if (nextKey === game.ko) return false;

        game.history.push({
            board: game.board.slice(),
            turn: game.turn,
            ko: game.ko,
            captured: game.captured.slice(),
            passes: game.passes,
        });
        game.board = next;
        game.turn = opponent;
        game.captured[player - 1] += captured;
        game.ko = captured === 1 ? previousKey : '';
        game.passes = 0;
        return true;
    }
    function goUndo(game){
        const h = game.history.pop();
        if (!h) return false;
        game.board = h.board;
        game.turn = h.turn;
        game.ko = h.ko;
        game.captured = h.captured;
        game.passes = h.passes;
        game.over = false;
        game.aiThinking = false;
        return true;
    }
    function goCountScore(game){
        const size = game.size;
        const seen = new Set();
        let black = game.captured[0], white = game.captured[1];
        for (let i = 0; i < game.board.length; i++){
            if (game.board[i] !== 0 || seen.has(i)) continue;
            const q = [i], region = [], owners = new Set();
            seen.add(i);
            while (q.length){
                const p = q.pop();
                region.push(p);
                for (const n of goNeighbors(size, p)){
                    if (game.board[n] === 0 && !seen.has(n)){
                        seen.add(n);
                        q.push(n);
                    } else if (game.board[n]) {
                        owners.add(game.board[n]);
                    }
                }
            }
            if (owners.size === 1){
                if (owners.has(1)) black += region.length;
                else white += region.length;
            }
        }
        return { black, white: white + 6.5 };
    }
    function goCandidates(game){
        const size = game.size;
        const set = new Set();
        game.board.forEach((v,i)=>{
            if (v) goNeighbors(size, i).forEach(n => { if (game.board[n] === 0) set.add(n); });
        });
        if (!set.size){
            const center = Math.floor((size * size) / 2);
            if (game.board[center] === 0) set.add(center);
            for (let i = 0; i < game.board.length; i++){
                if (game.board[i] === 0) set.add(i);
                if (set.size >= Math.min(32, game.board.length)) break;
            }
        }
        return [...set];
    }
    function goSimpleAI(game){
        const size = game.size;
        const cands = goCandidates(game);
        const me = 2;
        let best = null, bestScore = -Infinity;
        const center = (size - 1) / 2;

        for (const i of cands){
            const tmp = {
                size,
                board: game.board.slice(),
                history: [],
                captured: game.captured.slice(),
                turn: me,
                ko: game.ko,
                passes: game.passes,
                over: false,
                aiThinking: false,
            };
            if (!goMove(tmp, i, me)) continue;

            const own = goGroup(size, tmp.board, i);
            const [x,y] = goXY(size, i);
            const centerDistance = Math.abs(center - x) + Math.abs(center - y);
            let score = 0;
            score += (tmp.captured[1] - game.captured[1]) * 35;
            score += own.liberties.size * 5;
            score += Math.max(0, size - centerDistance) * 0.8;

            // 压制对手周围的弱子群。
            for (const n of goNeighbors(size, i)){
                if (tmp.board[n] === 1){
                    const opp = goGroup(size, tmp.board, n);
                    if (opp.liberties.size <= 2) score += (3 - opp.liberties.size) * 7;
                }
            }

            if (score > bestScore){
                bestScore = score;
                best = i;
            }
        }
        return best;
    }
    function newGo(size = GO_DEFAULT_SIZE, mode = 'ai'){
        return {
            size,
            board: Array(size * size).fill(0),
            turn: 1,
            captured: [0,0],
            history: [],
            ko: '',
            passes: 0,
            over: false,
            mode,
            aiThinking: false,
        };
    }
    function saveGo(){
        try { localStorage.setItem(GO_KEY, JSON.stringify(state.go)); } catch {}
    }
    function loadGo(){
        try {
            const g = JSON.parse(localStorage.getItem(GO_KEY) || 'null');
            if (!g || !GO_SIZE_OPTIONS.includes(Number(g.size))) return null;
            const size = Number(g.size);
            if (!Array.isArray(g.board) || g.board.length !== size * size) return null;
            g.size = size;
            g.mode = g.mode === 'pvp' ? 'pvp' : 'ai';
            g.aiThinking = false;
            return g;
        } catch { return null; }
    }
    function renderGo(body){
        cleanupGame();
        state.go = loadGo() || newGo(GO_DEFAULT_SIZE, 'ai');
        saveGo();

        const sizeRow = el('div',{class:'go-size-row'});
        const sizeLabel = el('span',{class:'go-size-label',text:'棋盘'});
        sizeRow.append(sizeLabel);
        const sizeButtons = new Map();
        GO_SIZE_OPTIONS.forEach(size=>{
            const b = el('button',{class:'stgc-btn go-size-btn',type:'button',text:`${size}×${size}`});
            b.addEventListener('click',()=>{
                if (state.go.size === size) return;
                state.go = newGo(size, state.go.mode);
                saveGo();
                draw();
                ai();
            });
            sizeButtons.set(size,b);
            sizeRow.append(b);
        });

        const top=el('div',{class:'stgc-status-row'});
        const status=el('div',{class:'stgc-status-text'});
        const mode=el('button',{class:'stgc-btn',type:'button'});
        const undo=el('button',{class:'stgc-btn',type:'button',text:'悔棋'});
        const pass=el('button',{class:'stgc-btn',type:'button',text:'停一手'});
        const reset=el('button',{class:'stgc-btn',type:'button',text:'重新开始'});
        top.append(status,mode,undo,pass,reset);

        const board=el('div',{class:'go-board'});
        const hint=el('div',{class:'stgc-game-hint',text:'围棋 · 9×9 / 13×13 / 19×19 · 默认本地 AI，无需 API'});
        body.append(sizeRow,top,board,hint);

        const draw=()=>{
            const g=state.go;
            const size=g.size;
            board.innerHTML='';
            board.style.setProperty('--go-size',String(size));
            board.style.setProperty('--go-step',`calc(100% / ${size - 1})`);
            board.dataset.size=String(size);
            sizeButtons.forEach((btn,s)=>btn.classList.toggle('is-selected',s===size));
            mode.textContent=g.mode==='ai'?'人机对战':'双人对战';
            undo.disabled = g.history.length===0 || g.aiThinking;
            pass.disabled = g.over || g.aiThinking;
            reset.disabled = g.aiThinking;

            if(g.over){
                const sc=goCountScore(g);
                status.textContent=`结束 · 黑 ${sc.black.toFixed(1)} · 白 ${sc.white.toFixed(1)}`;
            }else if(g.aiThinking){
                status.textContent='AI 思考中…';
            }else{
                status.textContent=`${g.turn===1?'黑棋':'白棋'} · 提子 ${g.captured[0]} / ${g.captured[1]}`;
            }

            const stars=new Set(goStarPoints(size).map(([x,y])=>goIndex(size,x,y)));
            for(let i=0;i<size*size;i++){
                const c=el('div',{class:'go-cell',role:'button',tabindex:'0'});
                if(g.board[i]===1)c.classList.add('black');
                if(g.board[i]===2)c.classList.add('white');
                if(stars.has(i))c.classList.add('star');
                c.dataset.index=String(i);
                c.setAttribute('aria-label',`第 ${Math.floor(i/size)+1} 行，第 ${i%size+1} 列`);
                board.append(c);
            }
        };

        const ai=()=>{
            const g=state.go;
            if(g.mode!=='ai'||g.over||g.turn!==2||g.aiThinking)return;
            g.aiThinking=true;
            draw();
            const timer=window.setTimeout(()=>{
                if(state.currentGame!=='go'||state.go!==g)return;
                const move=goSimpleAI(g);
                g.aiThinking=false;
                if(move==null){
                    g.passes++;
                    g.turn=1;
                }else{
                    goMove(g,move,2);
                }
                if(g.passes>=2)g.over=true;
                saveGo();
                draw();
            },180);
            state.goAiTimer=timer;
        };

        const playIndex=(index)=>{
            const g=state.go;
            if(g.over||g.aiThinking)return;
            if(g.mode==='ai'&&g.turn!==1)return;
            if(goMove(g,index,g.turn)){
                saveGo();
                draw();
                ai();
            }
        };

        board.addEventListener('click',e=>{
            const c=e.target.closest?.('.go-cell');
            if(!c)return;
            playIndex(Number(c.dataset.index));
        });
        board.addEventListener('keydown',e=>{
            const c=e.target.closest?.('.go-cell');
            if(!c || (e.key!=='Enter' && e.key!==' '))return;
            e.preventDefault();
            playIndex(Number(c.dataset.index));
        });

        mode.addEventListener('click',()=>{
            state.go = newGo(state.go.size,state.go.mode==='ai'?'pvp':'ai');
            saveGo();
            draw();
            ai();
        });
        undo.addEventListener('click',()=>{
            const g=state.go;
            if(g.aiThinking)return;
            if(g.mode==='ai'&&g.history.length>=2){
                goUndo(g); goUndo(g);
            }else{
                goUndo(g);
            }
            saveGo(); draw();
        });
        pass.addEventListener('click',()=>{
            const g=state.go;
            if(g.over||g.aiThinking)return;
            g.history.push({board:g.board.slice(),turn:g.turn,ko:g.ko,captured:g.captured.slice(),passes:g.passes});
            g.passes++;
            g.turn=g.turn===1?2:1;
            if(g.passes>=2)g.over=true;
            saveGo(); draw(); ai();
        });
        reset.addEventListener('click',()=>{
            const size=state.go.size, modeNow=state.go.mode;
            state.go=newGo(size,modeNow);
            saveGo(); draw(); ai();
        });

        state.cleanup=()=>{
            if(state.goAiTimer){ window.clearTimeout(state.goAiTimer); state.goAiTimer=null; }
            saveGo();
        };

        draw();
        if(state.go.mode==='ai'&&state.go.turn===2)ai();
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
        if (game.won) recordGameWin('spider');
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
        if (game.won) recordGameWin('spider');
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

    function initExtensionUI() {
        injectLauncher();
        const settings = getExtensionSettings();
        if (settings) setLauncherHidden(settings.launcherEnabled === false, false);

        let attempts = 0;
        const tryAddSettings = () => {
            if (addExtensionSettingsPanel() || attempts++ > 20) return;
            window.setTimeout(tryAddSettings, 250);
        };
        tryAddSettings();

        window.setTimeout(() => {
            void checkForSillyGameUpdate({ auto: true });
        }, 2500);
    }

    function init() {
        initExtensionUI();
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
