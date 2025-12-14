// 排行榜管理模块
import { api } from './api.js';
import { Toast } from './ui.js';

export class RankingManager {
    constructor() {
        this.currentPeriod = 'all';
        this.rankingData = [];
    }

    async init() {
        console.log('✅ 初始化排行榜管理器');
        this.setupTabSwitching();
        this.loadRanking('all');
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
                Toast.error(result.error || '加载排行榜失败');
            }
        } catch (err) {
            console.error('加载排行榜失败:', err);
            Toast.error('加载排行榜失败: ' + err.message);
        }
    }

    renderRanking(ranking) {
        const body = document.getElementById('rankingModalBody');
        if (!body) return;

        if (!ranking || ranking.length === 0) {
            body.innerHTML = `
                <div class="ranking-empty">
                    <div class="ranking-empty-icon">📊</div>
                    <div class="ranking-empty-text">暂无播放数据</div>
                </div>
            `;
            return;
        }

        body.innerHTML = ranking.map((item, index) => `
            <div class="ranking-item">
                <div class="ranking-rank">
                    <span class="ranking-number">${index + 1}</span>
                </div>
                <div class="ranking-content">
                    <div class="ranking-title">${item.title || '未知歌曲'}</div>
                    <div class="ranking-meta">
                        <span class="ranking-count">${item.play_count || 0}</span>
                        ${item.last_played ? `<span class="ranking-date">${this.formatDate(item.last_played)}</span>` : ''}
                    </div>
                </div>
                <div class="ranking-play">
                    <button class="ranking-play-btn" data-url="${item.url || ''}" data-title="${item.title || ''}" data-type="${item.type || 'local'}">
                        ▶ 播放
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
                
                if (url && title) {
                    try {
                        await api.play(url, title, type);
                        Toast.success(`正在播放: ${title}`);
                    } catch (err) {
                        Toast.error('播放失败: ' + err.message);
                    }
                }
            });
        });
    }

    formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp * 1000);
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
