(() => {
	// YouTube tab logic - now integrated into the main tab interface
	const youtubeSearchSection = document.getElementById('youtubeSearchSection');
	const youtubeQueueSection = document.getElementById('youtubeQueueSection');
	const youtubeQueueList = document.getElementById('youtubeQueueList');
	const clearQueueBtn = document.getElementById('clearQueueBtn');
	// localStorage keys and limits
	const STORAGE_KEY = 'youtube_history';
	const SEARCH_HISTORY_KEY = 'youtube_search_history';
	const MAX_LOCAL_HISTORY = 100;
	const MAX_SEARCH_HISTORY = 50;

	// Load local history from localStorage
	function getLocalHistory(){
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			return stored ? JSON.parse(stored) : [];
		} catch (e) {
			console.warn('[Storage] Failed to parse YouTube history:', e);
			return [];
		}
	}

	// Save history to localStorage
	function saveLocalHistory(history){
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
		} catch (e) {
			console.warn('[Storage] Failed to save YouTube history:', e);
		}
	}

	// Get search history
	function getSearchHistory(){
		try {
			const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
			return stored ? JSON.parse(stored) : [];
		} catch (e) {
			console.warn('[SearchHistory] Failed to parse search history:', e);
			return [];
		}
	}

	// Save search history (with deduplication)
	function saveSearchHistory(query){
		if(!query || !query.trim()) return;
		
		try {
			let history = getSearchHistory();
			// Remove if already exists (to move to top)
			history = history.filter(item => item.toLowerCase() !== query.toLowerCase().trim());
			// Add new item to front
			history.unshift(query.trim());
			// Keep only MAX_SEARCH_HISTORY items
			history = history.slice(0, MAX_SEARCH_HISTORY);
			localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
			console.debug('[SearchHistory] 已保存搜索: ' + query);
		} catch (e) {
			console.error('[SearchHistory] Error saving search history:', e);
		}
	}

	// Clear search history
	function clearSearchHistory(){
		try {
			localStorage.removeItem(SEARCH_HISTORY_KEY);
			console.debug('[SearchHistory] 搜索历史已清空');
		} catch (e) {
			console.error('[SearchHistory] Error clearing search history:', e);
		}
	}

	// Add new history item (called after successful play)
	function addToHistory(url, title){
		try {
			let history = getLocalHistory();
			// Remove if already exists (to move to top)
			history = history.filter(item => item.url !== url);
			// Add new item to front
			history.unshift({
				url: url,
				name: title || new URL(url).hostname,
				ts: Math.floor(Date.now() / 1000)
			});
			// Keep only MAX_LOCAL_HISTORY items
			history = history.slice(0, MAX_LOCAL_HISTORY);
			saveLocalHistory(history);
		} catch (e) {
			console.error('[Storage] Error adding to history:', e);
		}
	}

	function loadYoutubeHistory(){
		// History is now displayed via modal, not in the YouTube tab
		// This function is kept for compatibility but does nothing
		return;
	}

	function renderLocalHistory(){
		// History is now displayed via modal, not in the YouTube tab
		// This function is kept for compatibility but does nothing
		return;
	}

	// 通用的队列重新排序函数 (用于Desktop和Mobile)
	function performQueueReorder(sourceIdx, destIdx){
		fetch('/play_queue_reorder', {
			method: 'POST',
			headers: {'Content-Type': 'application/x-www-form-urlencoded'},
			body: `from_index=${sourceIdx}&to_index=${destIdx}`
		})
		.then(r => r.json())
		.then(res => {
			if(res && res.status === 'OK') {
				console.debug('[Queue] 队列已重新排序');
				loadYoutubeQueue();
			} else {
				console.error('[Queue] 排序失败:', res && res.error);
				alert('排序失败: ' + (res && res.error || '未知错误'));
			}
		})
		.catch(e => {
			console.error('[Queue] 请求失败:', e);
			alert('请求失败: ' + e.message);
		});
	}

	// Load and display current queue (supports both local and YouTube)
	function loadYoutubeQueue(){
		if(!youtubeQueueList || !youtubeQueueSection) return;
		
		// Always show the queue section
		youtubeQueueSection.style.display = 'block';
		
		// 始终加载合并的队列（本地 + YouTube）
		const apiEndpoint = '/combined_queue';
		
		fetch(apiEndpoint)
			.then(r => r.json())
			.then(res => {
				console.debug('[Queue] API 响应:', res);
				// 检查 API 返回状态和队列数据有效性
				if(res && res.status === 'OK' && Array.isArray(res.queue)){
					// 保存队列数据到全局变量供 main.js 使用（用于获取时长信息）
					window._queueData = res;
					youtubeQueueList.innerHTML = '';
					
					if(res.queue.length > 0){
						// 注意：current_index 可能为 0，不能用 || 回退
						const currentIndex = (typeof res.current_index === 'number') ? res.current_index : -1;
						console.debug('[Queue] 队列项数:', res.queue.length, '当前索引:', currentIndex, 'YouTube数量:', res.youtube_count);
						res.queue.forEach((item, idx) => {
							const div = document.createElement('div');
							const inQueue = item.in_queue === true;
							div.className = 'youtube-queue-item collapsed';
							div.dataset.index = idx;
							div.dataset.type = item.type; // 标记类型
							div.dataset.inQueue = inQueue ? '1' : '0';
							div.draggable = inQueue; // 队列中的项（本地和YouTube都支持拖拽）
							
							// 在标题前添加类型标记
							let typeIcon = item.type === 'youtube' ? '▶️' : '🎵';
							let typeLabel = item.type === 'youtube' ? ' [YouTube]' : ' [本地]';
						
						if(idx === currentIndex) {
							// 当前项：只显示，不响应点击
							div.classList.add('current', 'expanded');
							div.innerHTML = `<span class="queue-marker">▶</span> <span class="queue-title">${typeIcon} ${item.title}</span>`;
						} else {
							// 非当前项：可点击播放
							div.innerHTML = `<span class="queue-index">${idx + 1}.</span> <span class="queue-title">${typeIcon} ${item.title}</span>`;
							div.style.cursor = 'pointer';
							div.addEventListener('click', () => {
								// 无论是本地还是YouTube，都使用 /play_queue_play 来正确更新 CURRENT_QUEUE_INDEX
								console.debug('[Queue] 点击队列项:', item.type, item.title, '索引:', idx, 'inQueue:', inQueue);
								if(item.type === 'local') {
									if(inQueue) {
										// 队列中的本地文件：idx 就是 PLAY_QUEUE 中的真实索引
										console.debug('[Queue] 播放本地队列文件，队列索引:', idx);
										fetch('/play_queue_play', {
											method: 'POST',
											headers: {'Content-Type': 'application/x-www-form-urlencoded'},
											body: `index=${idx}`
										})
										.then(r => r.json())
										.then(res => {
											if(res && res.status === 'OK') {
												console.debug('[Queue] 播放本地队列文件成功');
												setTimeout(() => loadYoutubeQueue(), 100);
											} else {
												console.error('[Queue] 播放失败:', res && res.error);
											}
										})
										.catch(e => console.error('[Queue] 请求失败:', e));
									} else {
										// 历史记录中的本地文件：使用 /play 接口播放（不入队）
										fetch('/play', {
											method: 'POST',
											headers: {'Content-Type': 'application/x-www-form-urlencoded'},
											body: `path=${encodeURIComponent(item.url)}&skip_history=1`
										})
										.then(r => r.json())
										.then(res => {
											if(res && res.status === 'OK') {
												console.debug('[LocalHistory] 播放本地文件:', item.url);
												setTimeout(() => loadYoutubeQueue(), 100);
											} else {
												console.error('[LocalHistory] 播放失败:', res && res.error);
											}
										})
										.catch(e => console.error('[LocalHistory] 请求失败:', e));
									}
								} else if(item.type === 'youtube') {
									// YouTube 文件：优先在现有队列播放，不在队列则直接添加并播放
									if(inQueue) {
										fetch('/play_queue')
											.then(r => r.json())
											.then(ytRes => {
												if(ytRes && ytRes.status === 'OK' && ytRes.queue) {
													const ytIndex = ytRes.queue.findIndex(q => q.url === item.url);
													if(ytIndex >= 0) {
														fetch('/play_queue_play', {
															method: 'POST',
															headers: {'Content-Type': 'application/x-www-form-urlencoded'},
															body: `index=${ytIndex}`
														})
														.then(r => r.json())
														.then(res => {
															if(res && res.status === 'OK') {
																console.debug('[YouTubeQueue] 播放队列项:', ytIndex);
																setTimeout(() => loadYoutubeQueue(), 100);
															} else {
																console.error('[YouTubeQueue] 播放失败:', res && res.error);
															}
														})
														.catch(e => console.error('[YouTubeQueue] 请求失败:', e));
													}
												}
											})
											.catch(e => console.error('[YouTubeQueue] 获取队列失败:', e));
									} else {
										// 不在当前队列：追加到队列尾部（不直接播放）
										fetch('/play_queue_add', {
											method: 'POST',
											headers: {'Content-Type': 'application/x-www-form-urlencoded'},
											body: 'url=' + encodeURIComponent(item.url) + '&title=' + encodeURIComponent(item.title || '') + '&type=youtube'
										})
										.then(r => r.json())
										.then(res => {
											if(res && res.status === 'OK') {
												console.debug('[YouTubeQueue] 已追加到队列尾部:', item.url);
												setTimeout(() => loadYoutubeQueue(), 150);
											} else {
												console.error('[YouTubeQueue] 入队失败:', res && res.error);
											}
										})
										.catch(e => console.error('[YouTubeQueue] 入队请求失败:', e));
									}
								}
							});
						}
						
						// 队列中的项都支持拖拽和展开/折叠
						if(inQueue) {
							// 仅YouTube项支持展开/折叠
							if(item.type === 'youtube') {
								// 添加展开/折叠切换事件（在展开/折叠按钮区域）
								div.addEventListener('contextmenu', (e) => {
									e.preventDefault();
									e.stopPropagation();
									if(div.classList.contains('collapsed')) {
										div.classList.remove('collapsed');
										div.classList.add('expanded');
									} else if(div.classList.contains('expanded')) {
										div.classList.remove('expanded');
										div.classList.add('collapsed');
									}
								});
								
								// 长按或双击也能切换展开/折叠
								let clickCount = 0;
								let clickTimer = null;
								div.addEventListener('click', (e) => {
									// 如果是非当前项，且不是在拖拽，则可以双击切换展开/折叠
									if(!div.classList.contains('current') && !div.classList.contains('dragging')) {
										clickCount++;
										if(clickCount === 1) {
											clickTimer = setTimeout(() => {
												clickCount = 0;
											}, 300);
										} else if(clickCount === 2) {
											clearTimeout(clickTimer);
											clickCount = 0;
											if(div.classList.contains('collapsed')) {
												div.classList.remove('collapsed');
												div.classList.add('expanded');
											} else if(div.classList.contains('expanded')) {
												div.classList.remove('expanded');
												div.classList.add('collapsed');
											}
											e.stopPropagation();
										}
									}
								});
							}
							
							// 拖拽状态跟踪 (用于移动端)
							let touchDragState = null;
							
							// Desktop Drag & Drop API 支持
							div.addEventListener('dragstart', (e) => {
								div.classList.add('dragging');
								e.dataTransfer.effectAllowed = 'move';
								e.dataTransfer.setData('text/plain', idx);
								e.dataTransfer.setDragImage(new Image(), 0, 0);
								console.debug('[Drag] 开始拖动队列项:', idx);
							});
							
							div.addEventListener('dragend', (e) => {
								document.querySelectorAll('.youtube-queue-item.dragging, .youtube-queue-item.drag-over').forEach(el => {
									el.classList.remove('dragging', 'drag-over', 'drag-over-after');
								});
								console.debug('[Drag] 拖拽结束');
							});
							
							div.addEventListener('dragover', (e) => {
								e.preventDefault();
								e.dataTransfer.dropEffect = 'move';
								
								document.querySelectorAll('.youtube-queue-item.drag-over').forEach(el => {
									if(el !== div) el.classList.remove('drag-over', 'drag-over-after');
								});
								
								const rect = div.getBoundingClientRect();
								const midpoint = rect.top + rect.height / 2;
								div.classList.add('drag-over');
								
								if(e.clientY < midpoint) {
									div.classList.remove('drag-over-after');
								} else {
									div.classList.add('drag-over-after');
								}
							}, { passive: false });
							
							div.addEventListener('dragleave', (e) => {
								const rect = div.getBoundingClientRect();
								if(e.clientX < rect.left || e.clientX > rect.right || 
								   e.clientY < rect.top || e.clientY > rect.bottom) {
									div.classList.remove('drag-over', 'drag-over-after');
								}
							});
							
							div.addEventListener('drop', (e) => {
								e.preventDefault();
								e.stopPropagation();
								const sourceIdx = parseInt(e.dataTransfer.getData('text/plain'));
								const targetIdx = idx;
								
								document.querySelectorAll('.youtube-queue-item.drag-over, .youtube-queue-item.dragging').forEach(el => {
									el.classList.remove('drag-over', 'drag-over-after', 'dragging');
								});
								
								if(sourceIdx !== targetIdx) {
									const rect = div.getBoundingClientRect();
									const midpoint = rect.top + rect.height / 2;
									const insertAfter = e.clientY > midpoint;
									const destIdx = insertAfter ? targetIdx + 1 : targetIdx;
									
									console.debug('[Drag] 拖拽完成:', sourceIdx, '到', destIdx);
									performQueueReorder(sourceIdx, destIdx);
								}
							}, { passive: false });
							
							// ===== 移动端 Touch 拖拽支持 =====
							div.addEventListener('touchstart', (e) => {
								touchDragState = {
									sourceIdx: idx,
									startY: e.touches[0].clientY,
									startTime: Date.now(),
									isDragging: false
								};
								// 长按500ms后开始拖拽
								const touchStartTimeout = setTimeout(() => {
									if(touchDragState) {
										touchDragState.isDragging = true;
										div.classList.add('dragging');
										console.debug('[Touch] 开始拖动队列项:', idx);
									}
								}, 500);
								touchDragState.timeout = touchStartTimeout;
							}, { passive: true });
							
							div.addEventListener('touchmove', (e) => {
								if(!touchDragState || !touchDragState.isDragging) return;
								
								e.preventDefault();
								const currentY = e.touches[0].clientY;
								
								// 查找当前手指位置下面的队列项
								const allItems = Array.from(document.querySelectorAll('.youtube-queue-item'));
								const targetItem = allItems.find(item => {
									const rect = item.getBoundingClientRect();
									return currentY >= rect.top && currentY <= rect.bottom;
								});
								
								if(targetItem && targetItem !== div) {
									// 移除其他项的悬停样式
									allItems.forEach(item => item.classList.remove('drag-over', 'drag-over-after'));
									
									// 确定是在目标项的上方还是下方
									const targetRect = targetItem.getBoundingClientRect();
									const midpoint = targetRect.top + targetRect.height / 2;
									targetItem.classList.add('drag-over');
									
									if(currentY < midpoint) {
										targetItem.classList.remove('drag-over-after');
										touchDragState.targetItem = targetItem;
										touchDragState.insertAfter = false;
									} else {
										targetItem.classList.add('drag-over-after');
										touchDragState.targetItem = targetItem;
										touchDragState.insertAfter = true;
									}
								}
							}, { passive: false });
							
							div.addEventListener('touchend', (e) => {
								if(!touchDragState) return;
								
								// 清除长按超时
								if(touchDragState.timeout) clearTimeout(touchDragState.timeout);
								
								if(touchDragState.isDragging && touchDragState.targetItem) {
									const targetIdx = parseInt(touchDragState.targetItem.dataset.index);
									const sourceIdx = touchDragState.sourceIdx;
									
									if(sourceIdx !== targetIdx) {
										const insertAfter = touchDragState.insertAfter;
										const destIdx = insertAfter ? targetIdx + 1 : targetIdx;
										
										console.debug('[Touch] 拖拽完成:', sourceIdx, '到', destIdx);
										performQueueReorder(sourceIdx, destIdx);
									}
								}
								
								// 清除所有拖拽样式
								document.querySelectorAll('.youtube-queue-item.dragging, .youtube-queue-item.drag-over').forEach(el => {
									el.classList.remove('dragging', 'drag-over', 'drag-over-after');
								});
								
								touchDragState = null;
								console.debug('[Touch] 拖拽结束');
							}, { passive: true });
							
							div.addEventListener('touchcancel', (e) => {
								if(!touchDragState) return;
								if(touchDragState.timeout) clearTimeout(touchDragState.timeout);
								document.querySelectorAll('.youtube-queue-item.dragging, .youtube-queue-item.drag-over').forEach(el => {
									el.classList.remove('dragging', 'drag-over', 'drag-over-after');
								});
								touchDragState = null;
							}, { passive: true });
						}
						
						youtubeQueueList.appendChild(div);
						});
						
						// 自动滚动到当前播放项
						if(currentIndex >= 0) {
							const currentItem = youtubeQueueList.querySelector('.youtube-queue-item.current');
							if(currentItem) {
								// 延迟执行滚动，确保 DOM 已完全渲染
								setTimeout(() => {
									currentItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
									console.debug('[Queue] 已滚动到当前项，索引:', currentIndex);
								}, 50);
							}
						}
					} else {
						// 队列为空，显示提示信息
						console.debug('[Queue] 队列为空，显示提示');
						youtubeQueueList.innerHTML = `<div style="padding:16px; text-align:center; color:#888;">
							<div style="margin-bottom:8px;">暂无队列</div>
							<div style="font-size:12px; color:#666;">播放本地音乐或YouTube视频后会显示在这里</div>
						</div>`;
					}
				} else {
					// API 返回异常或数据格式错误
					console.warn('[Queue] API返回数据异常:', res);
					youtubeQueueList.innerHTML = `<div style="padding:16px; text-align:center; color:#888;">
						<div style="margin-bottom:8px;">队列加载失败</div>
						<div style="font-size:12px; color:#666;">请刷新页面重试</div>
					</div>`;
				}
			})
			.catch(e => {
				console.error('[Queue] 加载队列失败:', e);
				youtubeQueueList.innerHTML = '<div style="padding:16px; text-align:center; color:#888;">加载失败</div>';
			});
	}

	// 当标签页显示时加载历史和队列
	window.addEventListener('tabswitched', (e) => {
		if(e.detail && e.detail.tab === 'youtube'){
			loadYoutubeHistory();
			loadYoutubeQueue();
			// 每2秒刷新一次队列，以显示当前播放进度
			const queueRefreshInterval = setInterval(() => {
				if(document.getElementById('youtubePlaylist').style.display === 'none') {
					clearInterval(queueRefreshInterval);
				} else {
					loadYoutubeQueue();
				}
			}, 2000);
		}
	}, { passive: true });

	// 清空队列函数
	function clearYoutubeQueue() {
		if(confirm('确定要清空当前播放队列吗？')) {
			fetch('/play_queue_clear', {
				method: 'POST',
				headers: {'Content-Type': 'application/x-www-form-urlencoded'}
			})
			.then(r => r.json())
			.then(res => {
				if(res && res.status === 'OK') {
					console.debug('[UI] 队列已清空');
					loadYoutubeQueue();
				} else {
					console.error('[UI] 清空失败:', res && res.error);
					alert('清空队列失败: ' + (res && res.error || '未知错误'));
				}
			})
			.catch(e => {
				console.error('[UI] 请求失败:', e);
				alert('请求失败: ' + e.message);
			});
		}
	}

	// 清空队列按钮（保留以兼容旧版本，但不显示）
	if(clearQueueBtn) {
		clearQueueBtn.addEventListener('click', clearYoutubeQueue, { passive: true });
	}

	// 初始化加载历史记录和队列（当DOM就绪时）
	window.addEventListener('DOMContentLoaded', () => {
		loadYoutubeHistory();
		loadYoutubeQueue();
		initYoutubeSearch();
		
		// 在程序启动后前2秒内，每500ms加载一次队列，以确保捕捉到自动播放
		let initLoadCount = 0;
		const initLoadInterval = setInterval(() => {
			initLoadCount++;
			if(initLoadCount < 4) { // 运行2秒（4 * 500ms）
				loadYoutubeQueue();
			} else {
				clearInterval(initLoadInterval);
			}
		}, 500);
	}, { passive: true });
	
	// 备用方案：如果DOM已经加载完毕，直接加载
	if(document.readyState === 'interactive' || document.readyState === 'complete'){
		loadYoutubeHistory();
		loadYoutubeQueue();
		initYoutubeSearch();
		
		// 在程序启动后前2秒内，每500ms加载一次队列，以确保捕捉到自动播放
		let initLoadCount = 0;
		const initLoadInterval = setInterval(() => {
			initLoadCount++;
			if(initLoadCount < 4) { // 运行2秒（4 * 500ms）
				loadYoutubeQueue();
			} else {
				clearInterval(initLoadInterval);
			}
		}, 500);
	}

	// 展示播放历史（由main.js定义，这里作为包装）
	function showYoutubeHistory() {
		const historyModal = document.getElementById('historyModal');
		const historyList = document.getElementById('historyList');
		
		if(!historyModal || !historyList) {
			console.error('[History] 历史模态框元素未找到');
			return;
		}

		// 加载历史记录
		fetch('/youtube_history?limit=50')
			.then(r => r.json())
			.then(j => {
				if(j.status !== 'OK') {
					historyList.innerHTML = '<div style="padding:16px; text-align:center; color:#888;">无法加载历史记录</div>';
					return;
				}
				const history = j.history || [];
				if(history.length === 0) {
					historyList.innerHTML = '<div style="padding:16px; text-align:center; color:#888;">暂无播放历史</div>';
					historyModal.classList.add('show');
					return;
				}
				historyList.innerHTML = history.map((item, idx) => {
					let displayName = item.name || item.title || '未知';
					if(!displayName || displayName === '加载中…') {
						try {
							const url = item.url || '';
							if(url.includes('youtube')) {
								displayName = '播放列表或视频';
							} else {
								const urlObj = new URL(url);
								displayName = urlObj.hostname || displayName;
							}
						} catch(e) {
							displayName = '未知';
						}
					}
					const url = item.url || '';
					const itemType = item.type || 'unknown';
					return `<div class="history-item" data-url="${url.replace(/"/g, '&quot;')}" data-type="${itemType}">
						<div class="history-item-info">
							<div class="history-item-name">${displayName}</div>
							<div class="history-item-url">${url.substring(0, 100)}${url.length > 100 ? '...' : ''}</div>
						</div>
						<button class="history-item-delete" data-index="${idx}" title="删除">✕</button>
					</div>`;
				}).join('');

				// 添加点击处理器
				historyList.querySelectorAll('.history-item').forEach(item => {
					item.addEventListener('click', (e) => {
						if(!e.target.classList.contains('history-item-delete')) {
							const url = item.dataset.url;
							const itemType = item.dataset.type;
							if(url) {
								console.debug('[History] 播放历史项目:', url, '类型:', itemType);
								// 触发播放逻辑
								if(itemType === 'local') {
									fetch('/play', {
										method: 'POST',
										headers: {'Content-Type': 'application/x-www-form-urlencoded'},
										body: 'path=' + encodeURIComponent(url)
									})
									.then(r => r.json())
									.then(j => {
										if(j.status !== 'OK') {
											console.warn('播放失败:', j.error);
											alert('播放失败: ' + j.error);
										}
									})
									.catch(e => console.error('播放请求错误:', e));
								} else {
									fetch('/play_youtube_queue', {
										method: 'POST',
										headers: {'Content-Type': 'application/x-www-form-urlencoded'},
										body: 'url=' + encodeURIComponent(url)
									})
									.then(r => r.json())
									.then(j => {
										if(j && j.status === 'OK') {
											console.debug('[History] YouTube 队列已更新');
											historyModal.classList.remove('show');
										} else {
											console.error('[History] 播放失败:', j && j.error);
										}
									})
									.catch(e => console.error('[History] 请求失败:', e));
								}
							}
						}
					});
				});

				// 添加删除处理器
				historyList.querySelectorAll('.history-item-delete').forEach(btn => {
					btn.addEventListener('click', (e) => {
						e.stopPropagation();
						const item = e.target.closest('.history-item');
						item.remove();
					});
				});

				// 显示模态框
				historyModal.classList.add('show');
			})
			.catch(e => {
				console.error('加载历史失败:', e);
				historyList.innerHTML = '<div style="padding:16px; text-align:center; color:#888;">加载失败</div>';
				historyModal.classList.add('show');
			});
	}

	// YouTube搜索功能
	function initYoutubeSearch() {
		const youtubeSearchInput = document.getElementById('youtubeSearchInput');
		const youtubeSearchBtn = document.getElementById('youtubeSearchBtn');
		const youtubeMenuBtn = document.getElementById('youtubeMenuBtn');
		const youtubeMenu = document.getElementById('youtubeMenu');
		const youtubeSearchHistory = document.getElementById('youtubeSearchHistory');
		const youtubeSearchHistoryList = document.getElementById('youtubeSearchHistoryList');
		const historyMenuBtn = document.getElementById('historyMenuBtn');
		const clearQueueMenuBtn = document.getElementById('clearQueueMenuBtn');
		const localMenuBtn = document.getElementById('localMenuBtn');
		const localSongsModal = document.getElementById('localSongsModal');
		const localSongsModalBody = document.getElementById('localSongsModalBody');
		const localSongsModalClose = document.querySelector('.local-songs-modal-close');
		const treeEl = document.getElementById('tree');
		let treePlaceholder = null;
		const youtubeSearchModal = document.getElementById('youtubeSearchModal');
		const youtubeSearchModalList = document.getElementById('youtubeSearchModalList');
		const youtubeSearchModalClose = document.querySelector('.youtube-search-modal-close');

		if(!youtubeSearchBtn) return;

		// 显示搜索历史下拉列表
		function showSearchHistoryDropdown() {
			const history = getSearchHistory();
			if(history.length === 0) {
				youtubeSearchHistory.style.display = 'none';
				return;
			}

			youtubeSearchHistoryList.innerHTML = history.map(item => {
				return `<div class="youtube-search-history-item">${item}</div>`;
			}).join('');

			youtubeSearchHistory.style.display = 'block';

			// 为历史项添加点击事件
			youtubeSearchHistoryList.querySelectorAll('.youtube-search-history-item').forEach(item => {
				item.addEventListener('click', () => {
					youtubeSearchInput.value = item.textContent;
					youtubeSearchHistory.style.display = 'none';
					performSearch();
				}, { passive: true });
			});
		}

		// 隐藏搜索历史下拉列表
		function hideSearchHistoryDropdown() {
			youtubeSearchHistory.style.display = 'none';
		}

		// 搜索框 focus 事件 - 显示搜索历史
		youtubeSearchInput.addEventListener('focus', showSearchHistoryDropdown, { passive: true });

		// 搜索框 blur 事件 - 隐藏搜索历史（延迟，避免点击事件不生效）
		youtubeSearchInput.addEventListener('blur', () => {
			setTimeout(() => hideSearchHistoryDropdown(), 200);
		}, { passive: true });

		// 搜索按钮点击
		youtubeSearchBtn.addEventListener('click', performSearch, { passive: true });
		youtubeSearchInput.addEventListener('keypress', (e) => {
			if(e.key === 'Enter') performSearch();
		}, { passive: true });

		// 菜单按钮点击
		if(youtubeMenuBtn) {
			youtubeMenuBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				youtubeMenu.style.display = youtubeMenu.style.display === 'none' ? 'block' : 'none';
			}, { passive: true });
		}

		// 菜单项点击
		if(historyMenuBtn) {
			historyMenuBtn.addEventListener('click', () => {
				youtubeMenu.style.display = 'none';
				showYoutubeHistory();
			}, { passive: true });
		}

		// 本地歌曲菜单项：弹出本地歌曲窗口
		function openLocalSongsModal() {
			if(!localSongsModal || !localSongsModalBody || !treeEl) return;
			youtubeMenu.style.display = 'none';
			// 创建占位符用于关闭时还原
			if(!treePlaceholder) {
				treePlaceholder = document.createElement('div');
				treePlaceholder.id = 'treePlaceholder';
				treePlaceholder.style.display = 'none';
				treeEl.parentNode.insertBefore(treePlaceholder, treeEl);
			}
			// 将现有的树节点移入弹窗，保持事件绑定
			localSongsModalBody.innerHTML = '';
			localSongsModalBody.appendChild(treeEl);
			treeEl.style.display = 'block';
			localSongsModal.style.display = 'block';
		}

		function closeLocalSongsModal() {
			if(!localSongsModal || !localSongsModalBody || !treeEl || !treePlaceholder) return;
			localSongsModal.style.display = 'none';
			// 还原树节点到原位置并隐藏
			treePlaceholder.parentNode.replaceChild(treeEl, treePlaceholder);
			treeEl.style.display = 'none';
			treePlaceholder = null;
		}

		if(localMenuBtn) {
			localMenuBtn.addEventListener('click', () => {
				openLocalSongsModal();
			}, { passive: true });
		}

		if(clearQueueMenuBtn) {
			clearQueueMenuBtn.addEventListener('click', () => {
				youtubeMenu.style.display = 'none';
				clearYoutubeQueue();
			}, { passive: true });
		}

		if(localSongsModalClose) {
			localSongsModalClose.addEventListener('click', () => {
				closeLocalSongsModal();
			}, { passive: true });
		}

		// 点击模态背景关闭
		if(localSongsModal) {
			localSongsModal.addEventListener('click', (e) => {
				if(e.target === localSongsModal) {
					closeLocalSongsModal();
				}
			}, { passive: true });
		}

		// 点击外部关闭菜单
		document.addEventListener('click', (e) => {
			if(youtubeMenu && youtubeMenuBtn && !youtubeMenuBtn.contains(e.target) && !youtubeMenu.contains(e.target)) {
				youtubeMenu.style.display = 'none';
			}
		}, { passive: true });

		// 搜索模态框关闭按钮
		if(youtubeSearchModalClose) {
			youtubeSearchModalClose.addEventListener('click', () => {
				youtubeSearchModal.classList.remove('show');
			}, { passive: true });
		}

		// 点击模态框背景关闭
		if(youtubeSearchModal) {
			youtubeSearchModal.addEventListener('click', (e) => {
				if(e.target === youtubeSearchModal) {
					youtubeSearchModal.classList.remove('show');
				}
			}, { passive: true });
		}

		function performSearch() {
			const query = youtubeSearchInput.value.trim();
			if(!query) {
				alert('请输入搜索关键字或YouTube地址');
				return;
			}

			// 保存搜索历史
			saveSearchHistory(query);

			// 检查是否为 YouTube URL
			let isYouTubeUrl = false;
			let isPlaylist = false;
			try {
				const urlObj = new URL(query);
				const host = urlObj.hostname.toLowerCase();
				isYouTubeUrl = host.includes('youtube.com') || host.includes('youtu.be');
				// 检查是否为播放列表
				if(isYouTubeUrl) {
					isPlaylist = urlObj.search.includes('list=') || query.includes('/playlist');
				}
			} catch (e) {
				// 不是有效的 URL，作为搜索关键字处理
			}

			if(isYouTubeUrl) {
				if(isPlaylist) {
					// 是播放列表 URL，提取列表内容
					youtubeSearchBtn.disabled = true;
					youtubeSearchBtn.textContent = '加载中...';
					
					console.debug('[UI] 检测到播放列表 URL，提取列表内容');
					
					// 使用后端 API 提取播放列表
					fetch('/youtube_extract_playlist', {
						method: 'POST',
						headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
						body: 'url=' + encodeURIComponent(query)
					})
					.then(r => r.json())
					.then(res => {
						youtubeSearchBtn.disabled = false;
						youtubeSearchBtn.textContent = '搜索';
						
						if(res && res.status === 'OK' && res.entries && res.entries.length > 0) {
							youtubeSearchInput.value = '';
							// 显示播放列表内容
							const entries = res.entries;
							youtubeSearchModalList.innerHTML = entries.map((item, idx) => {
								const url = item.url || '';
								const title = item.title || '未知';
								return `<div class="youtube-search-item" data-url="${url.replace(/"/g, '&quot;')}" data-title="${title.replace(/"/g, '&quot;')}">
									<div class="youtube-search-item-title">${title}</div>
									<div class="youtube-search-item-meta">
										<span>${idx + 1}/${entries.length}</span>
									</div>
								</div>`;
							}).join('');
							youtubeSearchModal.classList.add('show');

							// Add click handlers - add to queue without interrupting playback
							youtubeSearchModalList.querySelectorAll('.youtube-search-item').forEach(item => {
								item.addEventListener('click', (e) => {
									const url = item.dataset.url;
									const title = item.dataset.title;
									if(url) {
										fetch('/play', {
											method: 'POST',
											headers: {'Content-Type': 'application/x-www-form-urlencoded'},
											body: `url=${encodeURIComponent(url)}&play_now=0`
										})
										.then(r => r.json())
										.then(res => {
											if(res && res.status === 'OK') {
												console.debug('[UI] 已添加到队列:', title);
												item.classList.add('added-to-queue');
												loadYoutubeQueue();
											} else {
												console.error('[UI] 添加失败:', res && res.error);
												alert('添加到队列失败: ' + (res && res.error || '未知错误'));
											}
										})
										.catch(e => {
											console.error('[UI] 请求失败:', e);
											alert('添加到队列失败: ' + e.message);
										});
									}
								});
							});
						} else {
							alert('播放列表为空或获取失败: ' + (res && res.error || '未知错误'));
						}
					})
					.catch(e => {
						youtubeSearchBtn.disabled = false;
						youtubeSearchBtn.textContent = '搜索';
						console.error('提取播放列表失败:', e);
						alert('提取播放列表失败: ' + e.message);
					});
				} else {
					// 是单个视频 URL，添加到队列
					youtubeSearchBtn.disabled = true;
					youtubeSearchBtn.textContent = '加入队列中...';
				
					fetch('/play', {
						method: 'POST',
						headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
						body: 'url=' + encodeURIComponent(query) + '&play_now=0'
					})
					.then(r => r.json())
					.then(res => {
						youtubeSearchBtn.disabled = false;
						youtubeSearchBtn.textContent = '搜索';
					
						if(res && res.status === 'OK') {
							youtubeSearchInput.value = '';
							loadYoutubeQueue();
						} else {
							alert('加入队列失败: ' + (res && res.error || '未知错误'));
						}
					})
					.catch(e => {
						youtubeSearchBtn.disabled = false;
						youtubeSearchBtn.textContent = '搜索';
						console.error('加入队列失败:', e);
						alert('加入队列失败: ' + e.message);
					});
				}
			} else {
				// 是搜索关键字，执行搜索
				youtubeSearchBtn.disabled = true;
				youtubeSearchBtn.textContent = '搜索中...';

				fetch('/youtube_search', {
					method: 'POST',
					headers: {'Content-Type': 'application/x-www-form-urlencoded'},
					body: 'query=' + encodeURIComponent(query)
				})
				.then(r => r.json())
				.then(j => {
					youtubeSearchBtn.disabled = false;
					youtubeSearchBtn.textContent = '搜索';

					if(j.status !== 'OK') {
						alert('搜索失败: ' + (j.error || '未知错误'));
						return;
					}

					const results = j.results || [];
					if(results.length === 0) {
						youtubeSearchModalList.innerHTML = '<div style="padding:16px; text-align:center; color:#888;">未找到结果</div>';
						youtubeSearchModal.classList.add('show');
						return;
					}

					youtubeSearchModalList.innerHTML = results.map((item, idx) => {
						const duration = formatDuration(item.duration);
						return `<div class="youtube-search-item" data-url="${item.url.replace(/"/g, '&quot;')}" data-title="${item.title.replace(/"/g, '&quot;')}">
							<div class="youtube-search-item-title">${item.title}</div>
							<div class="youtube-search-item-meta">
								<span>${item.uploader}</span>
								<span>${duration}</span>
							</div>
						</div>`;
					}).join('');
					youtubeSearchModal.classList.add('show');

					// Add click handlers - add to queue without interrupting playback
					youtubeSearchModalList.querySelectorAll('.youtube-search-item').forEach(item => {
						item.addEventListener('click', (e) => {
							const url = item.dataset.url;
							const title = item.dataset.title;
							if(url) {
								// 添加到队列而不中断当前播放
								fetch('/play', {
									method: 'POST',
									headers: {'Content-Type': 'application/x-www-form-urlencoded'},
									body: `url=${encodeURIComponent(url)}&play_now=0`
								})
								.then(r => r.json())
								.then(res => {
									if(res && res.status === 'OK') {
										console.debug('[UI] 已添加到队列:', title);
										// 改变背景色表示已添加
										item.classList.add('added-to-queue');
										// 重新加载队列显示
										loadYoutubeQueue();
									} else {
										console.error('[UI] 添加失败:', res && res.error);
										alert('添加到队列失败: ' + (res && res.error || '未知错误'));
									}
								})
								.catch(e => {
									console.error('[UI] 请求失败:', e);
									alert('添加到队列失败: ' + e.message);
								});
							}
						});
					});
				})
				.catch(e => {
					youtubeSearchBtn.disabled = false;
					youtubeSearchBtn.textContent = '搜索';
					console.error('搜索失败:', e);
					alert('搜索失败: ' + e.message);
				});
			}
		}
	}

	function formatDuration(seconds) {
		if(!seconds) return '未知';
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = seconds % 60;
		if(hours > 0) {
			return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
		}
		return `${minutes}:${String(secs).padStart(2, '0')}`;
	}

	// 暴露 loadYoutubeQueue 到全局作用域，供其他脚本使用
	window.loadYoutubeQueue = loadYoutubeQueue;

})();
