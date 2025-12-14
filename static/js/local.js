import { Toast } from './ui.js';

const buildFileCardsHTML = (node, currentPath = []) => {
    if (!node) {
        return '<div class="local-empty">暂无本地文件</div>';
    }

    let html = '';

    // 面包屑导航
    if (currentPath.length > 0) {
        const breadcrumbs = currentPath.map((item, index) => {
            const path = currentPath.slice(0, index + 1).join('/');
            return `<span class="breadcrumb-item" data-path="${path}">${item}</span>`;
        }).join('<span class="breadcrumb-sep">/</span>');
        
        html += `<div class="local-breadcrumb">
            <span class="breadcrumb-home" data-path="">🏠 根目录</span>
            ${breadcrumbs ? '<span class="breadcrumb-sep">/</span>' + breadcrumbs : ''}
        </div>`;
    }

    const dirs = node.dirs || [];
    const files = node.files || [];

    if (!dirs.length && !files.length) {
        return html + '<div class="local-empty">此目录为空</div>';
    }

    // 文件夹卡片
    const dirCards = dirs.map(dir => `
        <div class="local-card local-dir-card" data-dir-name="${dir.name}" title="${dir.name}">
            <div class="local-card-icon">📁</div>
            <div class="local-card-body">
                <div class="local-card-title">${dir.name}</div>
                <div class="local-card-meta">文件夹</div>
            </div>
        </div>
    `).join('');

    // 歌曲文件卡片
    const fileCards = files.map(file => `
        <div class="local-card local-file-card" data-file-path="${file.rel}" data-file-name="${file.name}" title="${file.name}">
            <div class="local-card-icon">🎵</div>
            <div class="local-card-body">
                <div class="local-card-title">${file.name}</div>
                <div class="local-card-meta">歌曲</div>
            </div>
        </div>
    `).join('');

    html += `<div class="local-card-grid">${dirCards}${fileCards}</div>`;
    return html;
};

export const localFiles = {
    treeEl: null,
    getPlaylistId: () => 'default',
    fullTree: null,
    currentPath: [],

    async init({ treeEl, getCurrentPlaylistId }) {
        this.treeEl = treeEl;
        if (typeof getCurrentPlaylistId === 'function') {
            this.getPlaylistId = getCurrentPlaylistId;
        }
        await this.loadTree();
    },

    async loadTree() {
        if (!this.treeEl) return;
        try {
            const response = await fetch('/tree');
            if (!response.ok) {
                console.warn('获取本地文件树失败');
                return;
            }

            const data = await response.json();
            if (data.status === 'OK' && data.tree) {
                this.fullTree = data.tree;
                this.currentPath = [];
                this.renderCurrentLevel();
            } else {
                this.treeEl.innerHTML = '<div class="local-empty">暂无本地文件</div>';
            }
        } catch (error) {
            console.error('加载本地文件树失败:', error);
        }
    },

    getCurrentNode() {
        if (!this.fullTree) return null;
        
        let node = this.fullTree;
        for (const dirName of this.currentPath) {
            if (!node.dirs) return null;
            node = node.dirs.find(d => d.name === dirName);
            if (!node) return null;
        }
        return node;
    },

    renderCurrentLevel() {
        if (!this.treeEl) return;
        const currentNode = this.getCurrentNode();
        this.treeEl.innerHTML = buildFileCardsHTML(currentNode, this.currentPath);
        this.bindClicks();
    },

    bindClicks() {
        if (!this.treeEl) return;
        
        // 绑定面包屑导航
        this.treeEl.querySelectorAll('.breadcrumb-home, .breadcrumb-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const path = el.getAttribute('data-path');
                this.currentPath = path ? path.split('/') : [];
                this.renderCurrentLevel();
            });
        });

        // 绑定文件夹点击
        this.treeEl.querySelectorAll('.local-dir-card').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const dirName = el.getAttribute('data-dir-name');
                if (dirName) {
                    this.currentPath.push(dirName);
                    this.renderCurrentLevel();
                }
            });
        });

        // 绑定歌曲文件点击
        this.treeEl.querySelectorAll('.local-file-card').forEach(el => {
            el.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const filePath = el.getAttribute('data-file-path');
                const fileName = el.getAttribute('data-file-name');
                if (filePath) {
                    await this.addFileToPlaylist(filePath, fileName);
                }
            });
        });
    },

    async addFileToPlaylist(filePath, fileName) {
        const playlistId = this.getPlaylistId();
        const songData = { url: filePath, title: fileName, type: 'local' };

        try {
            const response = await fetch('/playlist_add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playlist_id: playlistId,
                    song: songData
                })
            });

            if (response.ok) {
                Toast.success(`已添加: ${fileName}`);
            } else {
                const error = await response.json();
                Toast.error(`添加失败: ${error.error || '未知错误'}`);
            }
        } catch (error) {
            console.error('添加文件失败:', error);
            Toast.error('添加失败');
        }
    }
};
