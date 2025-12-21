import { Toast } from './ui.js';

let expandedDirs = new Set();  // 追踪展开的文件夹

const buildTreeHTML = (node, depth = 0, parentPath = '') => {
    if (!node) {
        return '<div class="local-empty">暂无本地文件</div>';
    }

    const dirs = node.dirs || [];
    const files = node.files || [];

    if (!dirs.length && !files.length) {
        return '<div class="local-empty">此目录为空</div>';
    }

    let html = '<div class="local-tree">';

    // 文件夹项
    dirs.forEach(dir => {
        const dirId = `dir-${parentPath}${dir.name}`;
        const isExpanded = expandedDirs.has(dirId);
        const toggleClass = isExpanded ? 'expanded' : 'collapsed';
        
        html += `
            <div class="tree-item tree-folder" data-dir-id="${dirId}" data-dir-name="${dir.name}" style="padding-left: ${depth * 20}px">
                <span class="tree-toggle ${toggleClass}">▶</span>
                <span class="tree-icon">📁</span>
                <span class="tree-label">${dir.name}</span>
            </div>
        `;
        
        // 如果展开了，显示子内容
        if (isExpanded) {
            const subTree = buildSubTreeHTML(dir, depth + 1, `${parentPath}${dir.name}/`);
            html += subTree;
        }
    });

    // 文件项
    files.forEach(file => {
        html += `
            <div class="tree-item tree-file" data-file-path="${file.rel}" data-file-name="${file.name}" style="padding-left: ${depth * 20}px">
                <span class="tree-icon">🎵</span>
                <span class="tree-label">${file.name}</span>
            </div>
        `;
    });

    html += '</div>';
    return html;
};

const buildSubTreeHTML = (node, depth, parentPath) => {
    const dirs = node.dirs || [];
    const files = node.files || [];
    let html = '';

    dirs.forEach(dir => {
        const dirId = `dir-${parentPath}${dir.name}`;
        const isExpanded = expandedDirs.has(dirId);
        const toggleClass = isExpanded ? 'expanded' : 'collapsed';
        
        html += `
            <div class="tree-item tree-folder" data-dir-id="${dirId}" data-dir-name="${dir.name}" style="padding-left: ${depth * 20}px">
                <span class="tree-toggle ${toggleClass}">▶</span>
                <span class="tree-icon">📁</span>
                <span class="tree-label">${dir.name}</span>
            </div>
        `;
        
        if (isExpanded) {
            const subTree = buildSubTreeHTML(dir, depth + 1, `${parentPath}${dir.name}/`);
            html += subTree;
        }
    });

    files.forEach(file => {
        html += `
            <div class="tree-item tree-file" data-file-path="${file.rel}" data-file-name="${file.name}" style="padding-left: ${depth * 20}px">
                <span class="tree-icon">🎵</span>
                <span class="tree-label">${file.name}</span>
            </div>
        `;
    });

    return html;
};

// 保持原来的函数名用于兼容性，但现在调用树状函数
const buildFileCardsHTML = (node, currentPath = []) => {
    return buildTreeHTML(node, 0, '');
};

export const localFiles = {
    treeEl: null,
    contentEl: null,
    searchInput: null,
    getPlaylistId: () => 'default',
    fullTree: null,
    currentPath: [],
    searchQuery: '',
    onSongAdded: null,  // ✅ 新增：添加歌曲成功后的回调

    async init({ treeEl, getCurrentPlaylistId, onSongAdded }) {
        this.treeEl = treeEl;
        this.contentEl = treeEl.querySelector('#localContent');
        this.searchInput = treeEl.querySelector('#localSearchInput');
        this.onSongAdded = onSongAdded;  // ✅ 保存回调
        
        if (typeof getCurrentPlaylistId === 'function') {
            this.getPlaylistId = getCurrentPlaylistId;
        }
        
        // 绑定搜索输入事件
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.renderCurrentLevel();
            });
        }
        
        await this.loadTree();
    },

    async loadTree() {
        if (!this.contentEl) return;
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
                this.contentEl.innerHTML = '<div class="local-empty">暂无本地文件</div>';
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

    filterNode(node, query) {
        if (!node || !query) {
            return node;
        }
        
        // 过滤文件夹和文件
        const filteredDirs = (node.dirs || []).filter(dir => {
            // 如果文件夹名称匹配，包含它
            if (dir.name.toLowerCase().includes(query)) {
                return true;
            }
            // 如果文件夹内的文件匹配，也包含文件夹
            const filteredFiles = (dir.files || []).filter(file =>
                file.name.toLowerCase().includes(query)
            );
            return filteredFiles.length > 0;
        });
        
        const filteredFiles = (node.files || []).filter(file =>
            file.name.toLowerCase().includes(query)
        );
        
        return {
            ...node,
            dirs: filteredDirs,
            files: filteredFiles
        };
    },

    renderCurrentLevel() {
        if (!this.contentEl) return;
        const currentNode = this.getCurrentNode();
        
        // 如果有搜索查询，应用过滤
        const displayNode = this.searchQuery ? this.filterNode(currentNode, this.searchQuery) : currentNode;
        
        this.contentEl.innerHTML = buildFileCardsHTML(displayNode, this.currentPath);
        this.bindClicks();
    },

    bindClicks() {
        if (!this.contentEl) return;
        
        // 绑定文件夹展开/收起
        this.contentEl.querySelectorAll('.tree-folder').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const dirId = el.getAttribute('data-dir-id');
                if (dirId) {
                    if (expandedDirs.has(dirId)) {
                        expandedDirs.delete(dirId);
                    } else {
                        expandedDirs.add(dirId);
                    }
                    this.renderCurrentLevel();
                }
            });
        });

        // 绑定歌曲文件点击
        this.contentEl.querySelectorAll('.tree-file').forEach(el => {
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
                // ✅ 添加成功后调用回调
                if (this.onSongAdded && typeof this.onSongAdded === 'function') {
                    setTimeout(() => {
                        this.onSongAdded();
                    }, 500);
                }
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
