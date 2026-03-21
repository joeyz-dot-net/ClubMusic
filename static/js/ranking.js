// 排行榜管理模块
import { api } from './api.js';
import { Toast } from './ui.js';
import { i18n } from './i18n.js';
import { player } from './player.js';

const RANKING_PLACEHOLDER_IMAGE = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2240%22%3E🎵%3C/text%3E%3C/svg%3E';

function createRankingEmptyElement() {
    const empty = document.createElement('div');
    empty.className = 'ranking-empty';

    const icon = document.createElement('div');
    icon.className = 'ranking-empty-icon';
    icon.textContent = '📊';

    const text = document.createElement('div');
    text.className = 'ranking-empty-text';
    text.textContent = i18n.t('ranking.empty');

    empty.appendChild(icon);
    empty.appendChild(text);
    return empty;
}

function createRankingItemElement(item, index, formattedDate) {
    const row = document.createElement('div');
    row.className = 'ranking-item';

    const rank = document.createElement('div');
    rank.className = 'ranking-rank';

    const number = document.createElement('span');
    number.className = 'ranking-number';
    number.textContent = String(index + 1);
    rank.appendChild(number);

    const thumbnail = document.createElement('div');
    thumbnail.className = 'ranking-thumbnail';

    const image = document.createElement('img');
    image.src = item.thumbnail_url || RANKING_PLACEHOLDER_IMAGE;
    image.alt = item.title || '未知歌曲';
    image.className = 'ranking-thumbnail-img';
    image.crossOrigin = 'anonymous';
    thumbnail.appendChild(image);

    const content = document.createElement('div');
    content.className = 'ranking-content';

    const title = document.createElement('div');
    title.className = 'ranking-title';
    title.textContent = item.title || '未知歌曲';

    const meta = document.createElement('div');
    meta.className = 'ranking-meta';

    const count = document.createElement('span');
    count.className = 'ranking-count';
    count.textContent = String(item.play_count || 0);
    meta.appendChild(count);

    if (formattedDate) {
        const date = document.createElement('span');
        date.className = 'ranking-date';
        date.textContent = formattedDate;
        meta.appendChild(date);
    }

    content.appendChild(title);
    content.appendChild(meta);

    const play = document.createElement('div');
    play.className = 'ranking-play';

    const button = document.createElement('button');
    button.className = 'ranking-play-btn';
    button.type = 'button';
    button.textContent = '▶';
    button.dataset.url = item.url || '';
    button.dataset.title = item.title || '';
    button.dataset.type = item.type || 'local';
    button.dataset.thumbnailUrl = item.thumbnail_url || '';
    play.appendChild(button);

    row.appendChild(rank);
    row.appendChild(thumbnail);
    row.appendChild(content);
    row.appendChild(play);
    return row;
}

export class RankingManager {
    constructor() {
        this.currentPeriod = 'all';
        this.rankingData = [];
    }

    async init() {
        console.log('✅ 初始化排行榜管理器');
        this.updateRankingTitle();
        this.setupTabSwitching();
        this.loadRanking('all');
        
        // 注册语言改变监听器
        i18n.onLanguageChange(() => {
            this.updateRankingTitle();
        });
    }

    /**
     * 更新排行页面的标题
     */
    updateRankingTitle() {
        const title = document.querySelector('#rankingModal .modal-title');
        if (title) {
            title.textContent = i18n.t('ranking.title');
        }
        this.updateRankingTabs();
        // 重新渲染排行列表以更新"播放"按钮的文本
        if (this.rankingData && this.rankingData.length > 0) {
            this.renderRanking(this.rankingData);
        }
    }

    /**
     * 更新排行榜标签文本
     */
    updateRankingTabs() {
        const tabs = document.querySelectorAll('.ranking-tab');
        const tabMappings = {
            'all': 'ranking.all',
            'day': 'ranking.day',
            'week': 'ranking.week',
            'month': 'ranking.month',
            'quarter': 'ranking.quarter',
            'year': 'ranking.year'
        };

        tabs.forEach(tab => {
            const period = tab.getAttribute('data-period');
            const key = tabMappings[period];
            if (key) {
                tab.textContent = i18n.t(key);
            }
        });
    }

    setupTabSwitching() {
        const rankingTabs = document.querySelectorAll('.ranking-tab');
        rankingTabs.forEach(tab => {
            tab.addEventListener('click', async () => {
                const period = tab.getAttribute('data-period');
                rankingTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                await this.loadRanking(period);
            });
        });
    }

    async loadRanking(period = 'all') {
        try {
            this.currentPeriod = period;
            const result = await api.getRanking(period);
            
            if (result.status === 'OK') {
                this.rankingData = result.ranking || [];
                this.renderRanking(this.rankingData);
            } else {
                Toast.error(result.error || i18n.t('ranking.loadFailed'));
            }
        } catch (err) {
            console.error('加载排行榜失败:', err);
            Toast.error(i18n.t('ranking.loadFailed') + ': ' + err.message);
        }
    }

    renderRanking(ranking) {
        const body = document.getElementById('rankingModalBody');
        if (!body) return;

        if (!ranking || ranking.length === 0) {
            body.replaceChildren(createRankingEmptyElement());
            return;
        }

        const fragment = document.createDocumentFragment();
        ranking.forEach((item, index) => {
            fragment.appendChild(createRankingItemElement(item, index, item.last_played ? this.formatDate(item.last_played) : ''));
        });
        body.replaceChildren(fragment);

        // 绑定播放按钮
        body.querySelectorAll('.ranking-play-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const url = btn.getAttribute('data-url');
                const title = btn.getAttribute('data-title');
                const type = btn.getAttribute('data-type');
                const thumbnail_url = btn.dataset.thumbnailUrl || '';
                
                if (url && title) {
                    try {
                        // 添加到默认播放列表的下一曲位置
                        const _rankActiveDefault = window.app?.modules?.playlistManager?.getActiveDefaultId?.() || 'default';
                        const response = await api.addSongToPlaylistTop(_rankActiveDefault, {
                            url: url,
                            title: title,
                            type: type,
                            thumbnail_url: thumbnail_url
                        });
                        
                        if (response.status === 'OK') {
                            Toast.success('➕ ' + i18n.t('ranking.addedToPlaylist') + ': ' + title);
                        } else if (response.duplicate) {
                            Toast.warning(title + ' 已在播放列表中');
                        } else {
                            Toast.error(i18n.t('ranking.addFailed') + ': ' + (response.error || response.message || '未知错误'));
                        }
                    } catch (err) {
                        // 检查是否是重复歌曲的错误
                        if (err.duplicate) {
                            Toast.warning(title + ' 已在播放列表中');
                        } else {
                            Toast.error(i18n.t('ranking.addFailed') + ': ' + (err.error || err.message));
                        }
                    }
                }
            });
        });
    }

    formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date((timestamp + player.clockOffset) * 1000);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return `今天 ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        } else if (date.toDateString() === yesterday.toDateString()) {
            return `昨天 ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        } else {
            return `${date.getMonth() + 1}月${date.getDate()}日`;
        }
    }
}

export const rankingManager = new RankingManager();
