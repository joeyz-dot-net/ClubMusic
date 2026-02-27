// 排行榜管理模块
import { api } from './api.js';
import { Toast } from './ui.js';
import { i18n } from './i18n.js';
import { player } from './player.js';

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
            body.innerHTML = `
                <div class="ranking-empty">
                    <div class="ranking-empty-icon">📊</div>
                    <div class="ranking-empty-text">${i18n.t('ranking.empty')}</div>
                </div>
            `;
            return;
        }

        body.innerHTML = ranking.map((item, index) => `
            <div class="ranking-item">
                <div class="ranking-rank">
                    <span class="ranking-number">${index + 1}</span>
                </div>
                <div class="ranking-thumbnail">
                    <img src="${item.thumbnail_url || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2240%22%3E🎵%3C/text%3E%3C/svg%3E'}" alt="${item.title || '未知歌曲'}" class="ranking-thumbnail-img" crossorigin="anonymous">
                </div>
                <div class="ranking-content">
                    <div class="ranking-title">${item.title || '未知歌曲'}</div>
                    <div class="ranking-meta">
                        <span class="ranking-count">${item.play_count || 0}</span>
                        ${item.last_played ? `<span class="ranking-date">${this.formatDate(item.last_played)}</span>` : ''}
                    </div>
                </div>
                <div class="ranking-play">
                    <button class="ranking-play-btn" data-url="${item.url || ''}" data-title="${item.title || ''}" data-type="${item.type || 'local'}" data-thumbnail_url="${item.thumbnail_url || ''}">
                        ▶
                    </button>
                </div>
            </div>
        `).join('');

        // 绑定播放按钮
        body.querySelectorAll('.ranking-play-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const url = btn.getAttribute('data-url');
                const title = btn.getAttribute('data-title');
                const type = btn.getAttribute('data-type');
                const thumbnail_url = btn.getAttribute('data-thumbnail_url');
                
                if (url && title) {
                    try {
                        // 添加到默认播放列表的下一曲位置
                        const response = await api.addSongToPlaylistTop('default', {
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
