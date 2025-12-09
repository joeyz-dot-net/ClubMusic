(() => {
	let ctx = {tree:{}, musicDir:''};
	try { ctx = JSON.parse(document.getElementById('boot-data').textContent); } catch(e) { console.warn('Boot data parse error', e); }
	const ROOT = document.getElementById('tree');
	function el(tag, cls, text){ const e=document.createElement(tag); if(cls)e.className=cls; if(text) e.textContent=text; return e; }

	function buildNode(node){
		const li = el('li','dir');
		if(node.rel) li.dataset.rel = node.rel;
		const label = el('div','label');
		const arrow = el('span','arrow','▶');
		const nameSpan = el('span','name', node.rel? node.name : '根目录');
		label.appendChild(arrow); label.appendChild(nameSpan);
		label.onclick = () => li.classList.toggle('collapsed');
		li.appendChild(label);
		const ul = el('ul');
		(node.dirs||[]).forEach(d=>ul.appendChild(buildNode(d)));
		(node.files||[]).forEach(f=>{
			const fi = el('li','file',f.name);
			fi.dataset.rel = f.rel;
			fi.onclick = () => play(f.rel, fi);
			ul.appendChild(fi);
		});
		li.appendChild(ul);
		if(node.rel) li.classList.add('collapsed');
		return li;
	}

	function render(){
		ROOT.innerHTML='';
		const topUL = el('ul');
		let rootView = ctx.tree;
		(rootView.dirs||[]).forEach(d=>topUL.appendChild(buildNode(d)));
		(rootView.files||[]).forEach(f=>{ const fi = el('li','file',f.name); fi.dataset.rel = f.rel; fi.onclick=()=>play(f.rel,fi); topUL.appendChild(fi); });
		ROOT.appendChild(topUL);
	}

	let lastLocatedRel = null;
	function expandTo(rel){
		if(!rel) return;
		if(rel === lastLocatedRel) return; // 防止频繁跳动
		const parts = rel.split('/');
		let acc = '';
		for(let i=0;i<parts.length-1;i++){
			acc = acc ? acc + '/' + parts[i] : parts[i];
			const dir = Array.from(document.querySelectorAll('li.dir')).find(d=>d.dataset.rel===acc);
			if(dir){ dir.classList.remove('collapsed'); }
		}
		const fileEl = Array.from(document.querySelectorAll('li.file')).find(f=>f.dataset.rel===rel);
		if(fileEl){
			fileEl.scrollIntoView({block:'center'});
			lastLocatedRel = rel;
		}
	}

	function play(rel, dom){
		// 添加本地文件到播放队列末尾（不立即播放）
		const title = dom?.textContent || rel;
		console.log('[PLAY] 被点击的DOM元素:', dom);
		console.log('[PLAY] 被点击的DOM的data-rel属性:', dom?.dataset?.rel);
		console.log('[PLAY] 收到的rel参数:', rel);
		console.log('[PLAY] 标题:', title);
		console.debug('[PLAY] 请求添加本地文件到队列:', rel, '标题:', title);
		
		// 立即高亮显示该文件
		document.querySelectorAll('.file.playing').forEach(e=>e.classList.remove('playing'));
		if(dom) {
			dom.classList.add('playing');
			console.log('[PLAY] 已高亮DOM元素，rel值:', dom?.dataset?.rel);
			expandTo(rel);
		}
		
		// 调用 /play 端点：添加到队列末尾，不立即播放
		const encodedPath = encodeURIComponent(rel);
		console.log('[PLAY] 编码后的路径:', encodedPath);
		const body = `path=${encodedPath}&play_now=0`;
		console.log('[PLAY] 请求body:', body);
		
		fetch('/play', {
			method:'POST',
			headers:{'Content-Type':'application/x-www-form-urlencoded'},
			body: body
		})
		.then(r=>r.json())
		.then(j=>{
			console.debug('[PLAY] /play 响应:', j);
			console.log('[PLAY] 响应状态:', j.status, '消息:', j.message || j.error);
			if(j.status!=='OK') { 
				console.warn('添加队列失败: ', j.error); 
				alert('添加队列失败: '+ j.error); 
				return; 
			}
			console.debug('[PLAY] 本地文件已添加到队列末尾');
			// 刷新队列UI显示新添加的项
			if(window.loadYoutubeQueue) {
				console.debug('[PLAY] 刷新队列UI');
				window.loadYoutubeQueue();
			}
		}).catch(e=>{ 
			console.error('[PLAY] 请求错误', e); 
			alert('添加队列请求错误: '+ e); 
		});
	}

	function pollStatus(){
		fetch('/status').then(r=>r.json()).then(j=>{
			if(j.status!=='OK') return;
			const bar = document.getElementById('nowPlaying');
			// 兼容 rel 和 url 字段名
			const rel = j.playing ? (j.playing.rel || j.playing.url) : null;
			if(!j.playing || !rel){ bar.textContent='未播放'; return; }
			// 优先使用服务器提供的 media_title（mpv 的 media-title）
			// 若不存在，则使用 name（仅当 name 不是 URL 时）；若仍为 URL，则显示加载占位文本
			let displayName = (j.playing.media_title && j.playing.media_title.length) ? j.playing.media_title : null;
			if(!displayName){
				const nameField = j.playing.name || rel || '';
				if(nameField.startsWith('http')){
					// 对于网络流，在没有真实标题之前显示加载提示，避免展示原始 URL 或域名造成误导
					displayName = '加载中…';
				} else {
					displayName = nameField;
				}
			}
			let label = '▶ '+ displayName;
			// 获取时长：优先使用 mpv duration，其次从队列数据中获取
			let duration = (j.mpv && j.mpv.duration) || 0;
			
			if(j.mpv && j.mpv.time!=null){
				const t = j.mpv.time||0;
				const fmt = s=>{ if(isNaN(s)) return '--:--'; const m=Math.floor(s/60), ss=Math.floor(s%60); return m+':'+(ss<10?'0':'')+ss; };
				
				if(duration > 0) {
					label += ' ['+ fmt(t) +' / '+ fmt(duration) + (j.mpv.paused?' | 暂停':'') +']';
					// 进度条
					const pct = Math.min(100, Math.max(0, t/duration*100));
					const fill = document.getElementById('playerProgressFill');
					const thumb = document.getElementById('playerProgressThumb');
					if(fill && !window._progressDragging) {
						fill.style.width = pct.toFixed(2)+'%';
						if(thumb) thumb.style.left = pct.toFixed(2)+'%';
					}
					// 同步更新当前播放项的进度背景
					const currentQueueItem = document.querySelector('.youtube-queue-item.current');
					if(currentQueueItem) {
						currentQueueItem.style.setProperty('--progress-width', pct.toFixed(2) + '%');
					}
				} else {
					// 没有时长信息，尝试从队列数据中获取
					const currentQueueItem = document.querySelector('.youtube-queue-item.current');
					if(currentQueueItem && window._queueData && window._queueData.queue) {
						const currentIndex = window._queueData.current_index;
						if(currentIndex >= 0 && currentIndex < window._queueData.queue.length) {
							const queueItem = window._queueData.queue[currentIndex];
							const queueDuration = queueItem.duration || 0;
							if(queueDuration > 0) {
								label += ' ['+ fmt(t) +' / '+ fmt(queueDuration) + (j.mpv.paused?' | 暂停':'') +']';
								const pct = Math.min(100, Math.max(0, t/queueDuration*100));
								const fill = document.getElementById('playerProgressFill');
								const thumb = document.getElementById('playerProgressThumb');
								if(fill && !window._progressDragging) {
									fill.style.width = pct.toFixed(2)+'%';
									if(thumb) thumb.style.left = pct.toFixed(2)+'%';
								}
								currentQueueItem.style.setProperty('--progress-width', pct.toFixed(2) + '%');
							} else {
								label += ' ['+ fmt(t) + (j.mpv.paused?' | 暂停':'') +']';
							}
						} else {
							label += ' ['+ fmt(t) + (j.mpv.paused?' | 暂停':'') +']';
						}
					} else {
						label += ' ['+ fmt(t) + (j.mpv.paused?' | 暂停':'') +']';
					}
				}
			}
			// 同步音量显示
			if(j.mpv && j.mpv.volume!=null){
				const vs = document.getElementById('volSlider');
				if(vs && !vs._dragging){ vs.value = Math.round(j.mpv.volume); }
			}
			// 更新播放/暂停按钮显示
			if(j.mpv){
				const playPauseBtn = document.getElementById('playPauseBtn');
				if(playPauseBtn){
					playPauseBtn.textContent = j.mpv.paused ? '▶' : '⏸';
					playPauseBtn.dataset.icon = j.mpv.paused ? '▶' : '⏸';
				}
			}
			bar.textContent = label;
			document.querySelectorAll('.file.playing').forEach(e=>e.classList.remove('playing'));
			// 高亮 & 定位 (仅对本地文件)
			const target = Array.from(document.querySelectorAll('#tree .file')).find(f=>f.dataset.rel===rel);
			if(target){
				target.classList.add('playing');
				expandTo(rel);
			}
			// 当播放的歌曲发生变化时，刷新队列显示
			if(rel && window.loadYoutubeQueue){
				if(window._lastPlayingUrl !== rel) {
					window._lastPlayingUrl = rel;
					// 延迟一下刷新，确保后端队列状态已更新
					setTimeout(() => window.loadYoutubeQueue(), 100);
				}
			}
		}).catch(()=>{}).finally(()=> setTimeout(pollStatus, 2000));
	}

	setTimeout(pollStatus, 1500);

	// 播放控制按钮
	const playPauseBtn = document.getElementById('playPauseBtn');
	const prevBtn = document.getElementById('prevBtn');
	const nextBtn = document.getElementById('nextBtn');
	if(playPauseBtn) playPauseBtn.onclick = ()=>{
		fetch('/toggle_pause', {method:'POST'}).then(r=>r.json()).then(j=>{
			if(j.status==='OK'){
				playPauseBtn.textContent = j.paused ? '▶' : '⏸';
				playPauseBtn.dataset.icon = j.paused ? '▶' : '⏸';
			} else {
				console.warn('切换播放/暂停失败:', j.error);
			}
		}).catch(e => console.error('切换播放/暂停请求失败:', e));
	};
	if(prevBtn) prevBtn.onclick = ()=>{
		// 检查是否在 YouTube 页面并且有队列
		const youtubeTab = document.getElementById('youtubePlaylist');
		if(youtubeTab && youtubeTab.style.display !== 'none') {
			// 在 YouTube 页面，控制队列
			fetch('/play_queue')
				.then(r => r.json())
				.then(res => {
					if(res && res.status === 'OK' && res.queue && res.queue.length > 0) {
						const currentIndex = res.current_index || 0;
						const prevIndex = currentIndex - 1;
						if(prevIndex >= 0) {
							fetch('/play_queue_play', {
								method: 'POST',
								headers: {'Content-Type': 'application/x-www-form-urlencoded'},
								body: `index=${prevIndex}`
							})
							.then(r => r.json())
							.then(res => {
								if(res && res.status === 'OK') {
									console.debug('[UI] 播放上一首');
									// 重新加载队列显示
									if(window.loadYoutubeQueue) window.loadYoutubeQueue();
								}
							});
						} else {
							console.warn('已是第一首');
						}
					} else {
						// 没有队列，使用本地文件的上一个
						fetch('/prev', {method:'POST'}).then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn(j.error); } });
					}
				})
				.catch(e => {
					console.error('获取队列失败:', e);
					// 降级到本地文件的上一个
					fetch('/prev', {method:'POST'}).then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn(j.error); } });
				});
		} else {
			// 本地文件页面，使用原有逻辑
			fetch('/prev', {method:'POST'}).then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn(j.error); } });
		}
	};
	if(nextBtn) nextBtn.onclick = ()=>{
		// 检查是否在 YouTube 页面并且有队列
		const youtubeTab = document.getElementById('youtubePlaylist');
		if(youtubeTab && youtubeTab.style.display !== 'none') {
			// 在 YouTube 页面，控制队列
			fetch('/play_queue')
				.then(r => r.json())
				.then(res => {
					if(res && res.status === 'OK' && res.queue && res.queue.length > 0) {
						const currentIndex = res.current_index || 0;
						const nextIndex = currentIndex + 1;
						if(nextIndex < res.queue.length) {
							fetch('/play_queue_play', {
								method: 'POST',
								headers: {'Content-Type': 'application/x-www-form-urlencoded'},
								body: `index=${nextIndex}`
							})
							.then(r => r.json())
							.then(res => {
								if(res && res.status === 'OK') {
									console.debug('[UI] 播放下一首');
									// 重新加载队列显示
									if(window.loadYoutubeQueue) window.loadYoutubeQueue();
								}
							});
						} else {
							console.warn('已是最后一首');
						}
					} else {
						// 没有队列，使用本地文件的下一个
						fetch('/next', {method:'POST'}).then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn(j.error); } });
					}
				})
				.catch(e => {
					console.error('获取队列失败:', e);
					// 降级到本地文件的下一个
					fetch('/next', {method:'POST'}).then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn(j.error); } });
				});
		} else {
			// 本地文件页面，使用原有逻辑
			fetch('/next', {method:'POST'}).then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn(j.error); } });
		}
	};

	// 循环模式按钮 (0=不循环, 1=单曲循环, 2=全部循环)
	const loopBtn = document.getElementById('loopBtn');
	if(loopBtn) {
		loopBtn.onclick = ()=>{
			fetch('/loop', {method:'POST'}).then(r=>r.json()).then(j=>{
				if(j.status==='OK'){
					const mode = j.loop_mode;
					// 更新按钮显示和状态
					loopBtn.dataset.loop_mode = mode;
					if(mode === 0) {
						loopBtn.textContent = '↻';
						loopBtn.title = '不循环';
						loopBtn.classList.remove('loop-single', 'loop-all');
					} else if(mode === 1) {
						loopBtn.textContent = '↻¹';
						loopBtn.title = '单曲循环';
						loopBtn.classList.add('loop-single');
						loopBtn.classList.remove('loop-all');
					} else if(mode === 2) {
						loopBtn.textContent = '↻∞';
						loopBtn.title = '全部循环';
						loopBtn.classList.add('loop-all');
						loopBtn.classList.remove('loop-single');
					}
				}
			}).catch(e => console.error('循环模式请求失败:', e));
		};
	}

	// 音量滑块事件
	const vol = document.getElementById('volSlider');
	if(vol){
		const send = val => {
			fetch('/volume', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'value='+val})
				.then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn('设置音量失败', j); } })
				.catch(e=>console.warn('音量请求错误', e));
		};
		let debounceTimer;
		vol.addEventListener('input', ()=>{
			vol._dragging = true;
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(()=>{ send(vol.value); vol._dragging=false; }, 120);
		});
		// 初始化: 获取当前音量
		fetch('/volume', {method:'POST'}).then(r=>r.json()).then(j=>{
			if(j.status==='OK' && j.volume!=null){ 
				vol.value = Math.round(j.volume);
			}
		}).catch(()=>{});
	}

	const toggleBtn = document.getElementById('toggleExpand');
	function updateToggleLabel(){
		if(!toggleBtn) return;
		const dirs = Array.from(document.querySelectorAll('#tree .dir'));
		const anyCollapsed = dirs.some(d=>d.classList.contains('collapsed'));
		toggleBtn.textContent = anyCollapsed ? '+' : '-';
	}
	if(toggleBtn){
		toggleBtn.onclick = ()=>{
			const dirs = document.querySelectorAll('#tree .dir');
			const anyCollapsed = Array.from(dirs).some(d=>d.classList.contains('collapsed'));
			if(anyCollapsed){
				dirs.forEach(d=>d.classList.remove('collapsed'));
			} else {
				dirs.forEach(d=>d.classList.add('collapsed'));
			}
			updateToggleLabel();
		};
	}
	render();
	// Update toggle button label after render so it reflects current tree state
	setTimeout(()=>{ try{ updateToggleLabel(); }catch(e){} }, 50);



	// ========== 标签页切换 ==========
	const headerBar = document.getElementById('headerBar');
	const headerContent = document.getElementById('headerContent');
	const tabBtns = document.querySelectorAll('.tab-btn');
	const localTab = document.querySelector('.local-tab');
	const youtubeTab = document.querySelector('.youtube-tab');
	const youtubePlaylist = document.getElementById('youtubePlaylist');
	const tabsNav = document.querySelector('.tabs-nav');
	const hasTabs = tabsNav && tabBtns.length > 0 && localTab && youtubeTab;

	// 头部始终显示，设置为 expanded 状态
	if(headerBar) {
		headerBar.classList.remove('header-collapsed');
		headerBar.classList.add('header-expanded');
	}

	if(hasTabs) {
		tabBtns.forEach(btn => {
			btn.addEventListener('click', () => {
				const tab = btn.dataset.tab;
				
				// 如果头部被折叠，先展开
				if(headerBar && headerBar.classList.contains('header-collapsed')) {
					headerBar.classList.remove('header-collapsed');
					headerBar.classList.add('header-expanded');
					console.debug('[Header] 展开头部导航栏');
				}
				resetHeaderAutoCollapseTimer();
				
				// 更新按钮状态
				tabBtns.forEach(b => b.classList.remove('active'));
				btn.classList.add('active');
				
				// 更新标签导航的主题
				tabsNav.classList.remove('local-tab-nav', 'youtube-tab-nav');
				if(tab === 'local') {
					tabsNav.classList.add('local-tab-nav');
				} else if(tab === 'youtube') {
					tabsNav.classList.add('youtube-tab-nav');
				}
				
				// 显示/隐藏内容
				if(tab === 'local'){
					localTab.style.display = '';
					youtubeTab.style.display = 'none';
				} else if(tab === 'youtube'){
					localTab.style.display = 'none';
					youtubeTab.style.display = '';
					// 触发自定义事件，让youtube.js知道标签页已切换
					window.dispatchEvent(new CustomEvent('tabswitched', { detail: { tab: 'youtube' } }));
				}
			}, { passive: true });
		});

		// 初始化标签导航主题为YouTube配色
		tabsNav.classList.add('youtube-tab-nav');
	} else {
		// 无标签时默认展示YouTube区域，隐藏本地区域（如果存在）
		if(youtubeTab) youtubeTab.style.display = '';
		if(localTab) localTab.style.display = 'none';
	}

	// ========== 音量弹出控制 ==========
	const volumePopupBtn = document.getElementById('volumePopupBtn');
	const volumePopup = document.getElementById('volumePopup');
	const volumeSliderTrack = document.getElementById('volumeSliderTrack');
	const volumeSliderFill = document.getElementById('volumeSliderFill');
	const volumeSliderThumb = document.getElementById('volumeSliderThumb');
	const volSlider = document.getElementById('volSlider');
	
	let isDraggingVolume = false;
	let volumeSendTimer = null;
	let pendingVolumeValue = null;
	
	// Update visual fill and thumb position based on value
	function updateVolumeDisplay(value) {
		const percent = (value / 100) * 100;
		volumeSliderFill.style.height = percent + '%';
		const thumbPos = (percent / 100) * (volumeSliderTrack.offsetHeight - 20); // 20 is thumb size
		volumeSliderThumb.style.bottom = thumbPos + 'px';
	}
	
	// Send volume to server (debounced to every 2 seconds)
	function sendVolumeToServer(value) {
		pendingVolumeValue = value;
		
		// If already waiting to send, just update pending value and return
		if(volumeSendTimer) return;
		
		// Send immediately
		fetch('/volume', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'value='+value})
			.then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn('设置音量失败', j); } })
			.catch(e=>console.warn('音量请求错误', e));
		
		// Set timer for next send (2 seconds)
		volumeSendTimer = setTimeout(() => {
			volumeSendTimer = null;
			// If value changed during wait, send the latest value
			if(pendingVolumeValue !== value) {
				sendVolumeToServer(pendingVolumeValue);
			}
		}, 2000);
	}
	
	// Helper to set volume value
	function setVolumeValue(value) {
		value = Math.max(0, Math.min(100, value));
		if(volSlider) volSlider.value = value;
		updateVolumeDisplay(value);
		// Send to server with 2-second frequency limit
		sendVolumeToServer(value);
	}

	// Show/hide volume popup
	volumePopupBtn && volumePopupBtn.addEventListener('click', () => {
		if(volumePopup.style.display === 'none'){
			// 获取当前音量并更新弹出框显示
			fetch('/volume', {method:'POST'})
				.then(r=>r.json())
				.then(j=>{
					if(j.status==='OK' && j.volume!=null){ 
						const currentVolume = Math.round(j.volume);
						if(volSlider) volSlider.value = currentVolume;
						updateVolumeDisplay(currentVolume);
					}
				})
				.catch(e => {
					// 降级：使用主滑块的值
					if(volSlider) {
						updateVolumeDisplay(volSlider.value);
					}
				});
			volumePopup.style.display = 'block';
			volumePopupBtn.classList.add('active');
		} else {
			volumePopup.style.display = 'none';
			volumePopupBtn.classList.remove('active');
		}
	});
	
	// Mouse down on track - direct value setting
	volumeSliderTrack && volumeSliderTrack.addEventListener('mousedown', (e) => {
		if(e.target === volumeSliderThumb) return; // Let thumb handle its own drag
		isDraggingVolume = true;
		setVolumeFromEvent(e);
	});
	
	// Mouse down on thumb - start drag
	volumeSliderThumb && volumeSliderThumb.addEventListener('mousedown', () => {
		isDraggingVolume = true;
	});
	
	// Helper to calculate value from mouse position
	function setVolumeFromEvent(e) {
		const rect = volumeSliderTrack.getBoundingClientRect();
		const y = e.clientY - rect.top;
		// Convert y position to value (inverted: top=max, bottom=min)
		const percent = Math.max(0, Math.min(100, (1 - (y / rect.height)) * 100));
		const value = Math.round((percent / 100) * 100);
		setVolumeValue(value);
	}
	
	// Mouse move - track drag
	document.addEventListener('mousemove', (e) => {
		if(isDraggingVolume && volumePopup.style.display === 'block') {
			setVolumeFromEvent(e);
		}
	});
	
	// Mouse up - end drag
	document.addEventListener('mouseup', () => {
		isDraggingVolume = false;
	});
	
	// Touch support
	volumeSliderTrack && volumeSliderTrack.addEventListener('touchstart', (e) => {
		if(e.target === volumeSliderThumb) isDraggingVolume = true;
		else setVolumeFromTouchEvent(e);
	});
	
	document.addEventListener('touchmove', (e) => {
		if(isDraggingVolume && volumePopup.style.display === 'block') {
			setVolumeFromTouchEvent(e);
		}
	});
	
	function setVolumeFromTouchEvent(e) {
		const touch = e.touches[0];
		const rect = volumeSliderTrack.getBoundingClientRect();
		const y = touch.clientY - rect.top;
		const percent = Math.max(0, Math.min(100, (1 - (y / rect.height)) * 100));
		const value = Math.round((percent / 100) * 100);
		setVolumeValue(value);
	}
	
	document.addEventListener('touchend', () => {
		isDraggingVolume = false;
	});

	// ========== 进度条拖动功能 ==========
	const playerProgress = document.getElementById('playerProgress');
	const playerProgressFill = document.getElementById('playerProgressFill');
	const playerProgressThumb = document.getElementById('playerProgressThumb');
	
	window._progressDragging = false;
	
	if(playerProgress) {
		// 鼠标点击进度条
		playerProgress.addEventListener('mousedown', (e) => {
			// 检查是否在折叠状态，如果是则不拖动进度条
			const playerBar = document.getElementById('playerBar');
			if(playerBar && playerBar.classList.contains('footer-collapsed')) {
				return; // 在折叠状态下，不处理拖动
			}
			window._progressDragging = true;
			playerProgress.classList.add('dragging');
			seekToPosition(e);
		});
		
		// 鼠标移动
		document.addEventListener('mousemove', (e) => {
			if(window._progressDragging) {
				seekToPosition(e);
			}
		});
		
		// 鼠标释放
		document.addEventListener('mouseup', () => {
			if(window._progressDragging) {
				window._progressDragging = false;
				playerProgress.classList.remove('dragging');
			}
		});
		
		// 触摸支持
		playerProgress.addEventListener('touchstart', (e) => {
			// 检查是否在折叠状态，如果是则不拖动进度条
			const playerBar = document.getElementById('playerBar');
			if(playerBar && playerBar.classList.contains('footer-collapsed')) {
				return; // 在折叠状态下，不处理拖动
			}
			e.preventDefault(); // 防止触发其他事件
			window._progressDragging = true;
			playerProgress.classList.add('dragging');
			seekToPositionTouch(e);
		}, { passive: false });
		
		document.addEventListener('touchmove', (e) => {
			if(window._progressDragging) {
				e.preventDefault(); // 防止页面滚动
				seekToPositionTouch(e);
			}
		}, { passive: false });
		
		document.addEventListener('touchend', () => {
			if(window._progressDragging) {
				window._progressDragging = false;
				playerProgress.classList.remove('dragging');
			}
		});
		
	// 计算并跳转到指定位置
	function seekToPosition(e) {
		const rect = playerProgress.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
		
		// 更新视觉显示
		if(playerProgressFill) playerProgressFill.style.width = percent + '%';
		if(playerProgressThumb) playerProgressThumb.style.left = percent + '%';
		
		// 同步更新当前播放项的进度背景
		const currentQueueItem = document.querySelector('.youtube-queue-item.current');
		if(currentQueueItem) {
			currentQueueItem.style.setProperty('--progress-width', percent + '%');
		}
		
		// 发送跳转请求
		sendSeekRequest(percent);
	}	function seekToPositionTouch(e) {
		const touch = e.touches[0];
		const rect = playerProgress.getBoundingClientRect();
		const x = touch.clientX - rect.left;
		const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
		
		// 更新视觉显示
		if(playerProgressFill) playerProgressFill.style.width = percent + '%';
		if(playerProgressThumb) playerProgressThumb.style.left = percent + '%';
		
		// 同步更新当前播放项的进度背景
		const currentQueueItem = document.querySelector('.youtube-queue-item.current');
		if(currentQueueItem) {
			currentQueueItem.style.setProperty('--progress-width', percent + '%');
		}
		
		// 发送跳转请求
		sendSeekRequest(percent);
	}		// 发送跳转请求到服务器
		let seekTimer = null;
		let lastSeekTime = 0;
		let pendingSeekPercent = null;
		
		function sendSeekRequest(percent) {
			pendingSeekPercent = percent;
			const now = Date.now();
			
			// 如果距离上次请求已超过 2 秒，立即发送
			if(now - lastSeekTime >= 2000) {
				executeSeek();
			} else {
				// 否则安排在 2 秒后发送
				clearTimeout(seekTimer);
				seekTimer = setTimeout(() => {
					executeSeek();
				}, 2000 - (now - lastSeekTime));
			}
		}
		
		function executeSeek() {
			if(pendingSeekPercent === null) return;
			
			lastSeekTime = Date.now();
			const percent = pendingSeekPercent;
			
			fetch('/seek', {
				method: 'POST',
				headers: {'Content-Type': 'application/x-www-form-urlencoded'},
				body: 'percent=' + percent
			})
			.then(r => r.json())
			.then(j => {
				if(j.status !== 'OK') {
					console.warn('跳转失败:', j.error);
				}
			})
			.catch(e => console.error('跳转请求失败:', e));
		}
	}

	// Close popup when clicking outside
	document.addEventListener('click', (e) => {
		if(volumePopup && volumePopup.style.display === 'block' && 
		   !volumePopup.contains(e.target) && !volumePopupBtn.contains(e.target)){
			volumePopup.style.display = 'none';
			volumePopupBtn.classList.remove('active');
		}
	});

	// History modal functionality
	const historyBtn = document.getElementById('historyBtn');
	const historyModal = document.getElementById('historyModal');
	const historyList = document.getElementById('historyList');
	const historyModalClose = document.querySelector('.history-modal-close');

	// 展示播放历史函数
	function showYoutubeHistory() {
		loadHistoryModal();
		historyModal.classList.add('show');
	}

	if(historyBtn) {
		historyBtn.addEventListener('click', showYoutubeHistory);
	}

	if(historyModalClose) {
		historyModalClose.addEventListener('click', () => {
			historyModal.classList.remove('show');
		});
	}

	// Close history modal when clicking outside
	if(historyModal) {
		historyModal.addEventListener('click', (e) => {
			if(e.target === historyModal) {
				historyModal.classList.remove('show');
			}
		});
	}

	function loadHistoryModal() {
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
					return;
				}
			historyList.innerHTML = history.map((item, idx) => {
				// 提取显示名称：优先使用 name，其次使用 title，最后从 URL 提取
				let displayName = item.name || item.title || '未知';
				if(!displayName || displayName === '加载中…') {
					// 如果是 URL，尝试提取更好的名称
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
				const itemType = item.type || 'unknown'; // 记录项目类型
				return `<div class="history-item" data-url="${url.replace(/"/g, '&quot;')}" data-type="${itemType}">
					<div class="history-item-info">
						<div class="history-item-name">${displayName}</div>
						<div class="history-item-url">${url.substring(0, 100)}${url.length > 100 ? '...' : ''}</div>
					</div>
					<button class="history-item-delete" data-index="${idx}" title="删除">✕</button>
				</div>`;
			}).join('');

			// Add click handlers for playback
			historyList.querySelectorAll('.history-item').forEach(item => {
				item.addEventListener('click', (e) => {
					// 忽略删除按钮的点击
					if(e.target.classList.contains('history-item-delete') || 
					   e.target.closest('.history-item-delete')) {
						return;
					}
					const url = item.dataset.url;
					const itemType = item.dataset.type;
					const titleEl = item.querySelector('.history-item-name');
					const title = titleEl ? titleEl.textContent : '';
					console.debug('[HISTORY-CLICK] url=', url, 'type=', itemType, 'title=', title);
					if(url) {
						playHistoryItem(url, itemType, title);
					}
				});
			});				// Add delete handlers
				historyList.querySelectorAll('.history-item-delete').forEach(btn => {
					btn.addEventListener('click', (e) => {
						e.stopPropagation();
						const item = e.target.closest('.history-item');
						item.remove();
						// Could add backend support for deletion later
					});
				});
			})
			.catch(e => {
				console.error('Failed to load history:', e);
				historyList.innerHTML = '<div style="padding:16px; text-align:center; color:#888;">加载失败</div>';
			});
	}

	function playHistoryItem(url, itemType, title) {
		console.debug('[HISTORY] 播放历史项目:', url, '类型:', itemType, '标题:', title);
		
		if(!url) {
			console.warn('[HISTORY] URL为空，中止操作');
			return;
		}
		
		if(itemType === 'local') {
			// 本地文件：添加到队列末尾（不立即播放）
			console.debug('[HISTORY] 添加本地文件到队列:', url);
			const body = 'path=' + encodeURIComponent(url) + '&play_now=0';
			fetch('/play', {
				method: 'POST',
				headers: {'Content-Type': 'application/x-www-form-urlencoded'},
				body: body
			})
			.then(r => r.json())
			.then(j => {
				console.debug('[HISTORY] /play API响应:', j);
				if(j.status === 'OK') {
					console.debug('[HISTORY] 本地文件已添加到队列:', url);
					// 刷新队列显示
					setTimeout(() => {
						console.debug('[HISTORY] 开始刷新队列显示...');
						if(window.loadYoutubeQueue) {
							window.loadYoutubeQueue();
						}
					}, 500);
				} else {
					console.warn('添加失败:', j.error);
					alert('添加失败: ' + j.error);
				}
			})
			.catch(e => console.error('请求错误:', e));
		} else {
			// YouTube URL：添加到队列末尾（不立即播放）
			const body = 'url=' + encodeURIComponent(url) + '&type=youtube' +
						(title ? '&title=' + encodeURIComponent(title) : '');
			console.debug('[HISTORY] 添加YouTube视频到队列:', url);
			fetch('/play_queue_add', {
				method: 'POST',
				headers: {'Content-Type': 'application/x-www-form-urlencoded'},
				body: body
			})
			.then(r => r.json())
			.then(j => {
				console.debug('[HISTORY] /play_queue_add API响应:', j);
				if(j.status === 'OK') {
					console.debug('[HISTORY] YouTube视频已添加到队列:', url, '队列长度:', j.queue_length);
					// 刷新队列显示
					setTimeout(() => {
						console.debug('[HISTORY] 开始刷新队列显示...');
						if(window.loadYoutubeQueue) {
							window.loadYoutubeQueue();
						}
					}, 500);
				} else {
					console.warn('添加失败:', j.error);
					alert('添加失败: ' + j.error);
				}
			})
			.catch(e => console.error('请求错误:', e));
		}
	}

	// ===== 页脚展开/折叠逻辑 =====
	const playerBar = document.getElementById('playerBar');
	const footerContent = document.getElementById('footerContent');
	let autoCollapseTimer = null;

	// 自动折叠功能 (10秒无操作)
	function resetAutoCollapseTimer() {
		if(autoCollapseTimer) clearTimeout(autoCollapseTimer);
		
		if(playerBar && playerBar.classList.contains('footer-expanded')) {
			autoCollapseTimer = setTimeout(() => {
				if(playerBar && playerBar.classList.contains('footer-expanded')) {
					playerBar.classList.remove('footer-expanded');
					playerBar.classList.add('footer-collapsed');
					console.debug('[Footer] 10秒无操作，自动折叠页脚控制栏');
					// 显示三个点
					const nowPlayingEl = document.getElementById('nowPlaying');
					if(nowPlayingEl) {
						nowPlayingEl._originalText = nowPlayingEl.textContent;
						nowPlayingEl.textContent = '...';
					}
				}
			}, 10000); // 10秒
		}
	}

	// 初始状态: 折叠
	if(playerBar) {
		playerBar.classList.add('footer-collapsed');
	}

	// 点击整个控制栏区域展开/折叠页脚
	if(playerBar) {
		playerBar.addEventListener('click', (e) => {
			// 如果点击的是进度条且展开状态，不处理展开/折叠逻辑（让进度条拖拽处理）
			if(playerProgress && playerProgress.contains(e.target) && playerBar.classList.contains('footer-expanded')) {
				return;
			}
			
			e.stopPropagation();
			
			const nowPlayingEl = document.getElementById('nowPlaying');
			
			// 折叠状态：展开控制栏
			if(playerBar.classList.contains('footer-collapsed')) {
				playerBar.classList.remove('footer-collapsed');
				playerBar.classList.add('footer-expanded');
				console.debug('[Footer] 展开页脚控制栏');
				// 恢复正常文本
				if(nowPlayingEl && nowPlayingEl._originalText) {
					nowPlayingEl.textContent = nowPlayingEl._originalText;
				}
				resetAutoCollapseTimer(); // 启动自动折叠计时器
			} else {
				// 展开状态：点击非进度条区域折叠
				playerBar.classList.remove('footer-expanded');
				playerBar.classList.add('footer-collapsed');
				console.debug('[Footer] 折叠页脚控制栏');
				// 保存原始文本，显示三个点
				if(nowPlayingEl) {
					nowPlayingEl._originalText = nowPlayingEl.textContent;
					nowPlayingEl.textContent = '...';
				}
				if(autoCollapseTimer) clearTimeout(autoCollapseTimer);
			}
		}, { passive: false });
	}

	// 进度条单独处理（用于展开状态下的拖拽，而不是展开/折叠）
	if(playerProgress) {
		playerProgress.addEventListener('click', (e) => {
			// 只在展开状态下处理进度条点击（用于调整进度）
			if(playerBar && playerBar.classList.contains('footer-expanded')) {
				e.stopPropagation();
				// 进度条拖拽逻辑由 mousedown/touchstart 处理
			}
		}, { passive: false });
	}

	// 点击footer-content区域不触发关闭，并重置计时器
	if(footerContent) {
		footerContent.addEventListener('click', (e) => {
			e.stopPropagation(); // 防止冒泡到playerBar的展开/折叠逻辑
			resetAutoCollapseTimer(); // 用户操作，重置计时器
		}, { passive: false });
	}

	// 页脚区域内的鼠标移动重置计时器
	if(playerBar) {
		playerBar.addEventListener('mousemove', () => {
			resetAutoCollapseTimer();
		}, { passive: true });
	}

	// 移动设备触摸事件也要重置计时器
	if(footerContent) {
		footerContent.addEventListener('touchstart', resetAutoCollapseTimer, { passive: true });
		footerContent.addEventListener('touchmove', resetAutoCollapseTimer, { passive: true });
		footerContent.addEventListener('touchend', resetAutoCollapseTimer, { passive: true });
	}

	// 可选: 点击页脚外部时自动折叠 (防止占用太多屏幕空间)
	document.addEventListener('click', (e) => {
		if(playerBar && playerBar.classList.contains('footer-expanded')) {
			// 检查点击是否在playerBar内
			if(!playerBar.contains(e.target)) {
				// 点击在页脚外，自动折叠
				playerBar.classList.remove('footer-expanded');
				playerBar.classList.add('footer-collapsed');
				console.debug('[Footer] 自动折叠页脚控制栏');
				if(autoCollapseTimer) clearTimeout(autoCollapseTimer);
			}
		}
	}, { passive: true });
})();
