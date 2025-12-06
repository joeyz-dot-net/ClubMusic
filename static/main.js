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
		console.debug('[PLAY] 请求播放:', rel);
		fetch('/play', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:'path='+encodeURIComponent(rel)})
			.then(r=>r.json())
			.then(j=>{
				console.debug('[PLAY] /play 响应:', j);
				if(j.status!=='OK') { console.warn('播放失败: ', j.error); alert('播放失败: '+ j.error); return; }
				document.querySelectorAll('.file.playing').forEach(e=>e.classList.remove('playing'));
				dom.classList.add('playing');
				const bar = document.getElementById('nowPlaying');
				bar.textContent = '▶ '+ rel;
			}).catch(e=>{ console.error('[PLAY] 请求错误', e); alert('请求错误: '+ e); });
	}

	function pollStatus(){
		fetch('/status').then(r=>r.json()).then(j=>{
			if(j.status!=='OK') return;
			const bar = document.getElementById('nowPlaying');
			if(!j.playing || !j.playing.rel){ bar.textContent='未播放'; return; }
			const rel = j.playing.rel;
			const displayName = j.playing.name || rel;
			let label = '▶ '+ displayName;
			if(j.mpv && j.mpv.time!=null && j.mpv.duration){
				const t = j.mpv.time||0, d = j.mpv.duration||0;
				const fmt = s=>{ if(isNaN(s)) return '--:--'; const m=Math.floor(s/60), ss=Math.floor(s%60); return m+':'+(ss<10?'0':'')+ss; };
				label += ' ['+ fmt(t) +' / '+ fmt(d) + (j.mpv.paused?' | 暂停':'') +']';
				// 进度条
				if(d>0){
					const pct = Math.min(100, Math.max(0, t/d*100));
					const fill = document.getElementById('playerProgressFill');
					if(fill) fill.style.width = pct.toFixed(2)+'%';
				}
			}
			// 同步音量显示
			if(j.mpv && j.mpv.volume!=null){
				const vs = document.getElementById('volSlider');
				if(vs && !vs._dragging){ vs.value = Math.round(j.mpv.volume); }
			}
			bar.textContent = label;
			document.querySelectorAll('.file.playing').forEach(e=>e.classList.remove('playing'));
			// 高亮 & 定位
			const target = Array.from(document.querySelectorAll('#tree .file')).find(f=>f.dataset.rel===rel);
			if(target){
				target.classList.add('playing');
				expandTo(rel);
			}
		}).catch(()=>{}).finally(()=> setTimeout(pollStatus, 2000));
	}

	setTimeout(pollStatus, 1500);

	// 播放控制按钮
	const prevBtn = document.getElementById('prevBtn');
	const nextBtn = document.getElementById('nextBtn');
	const shuffleBtn = document.getElementById('shuffleBtn');
	if(prevBtn) prevBtn.onclick = ()=>{
		fetch('/prev', {method:'POST'}).then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn(j.error); } });
	};
	if(nextBtn) nextBtn.onclick = ()=>{
		fetch('/next', {method:'POST'}).then(r=>r.json()).then(j=>{ if(j.status!=='OK'){ console.warn(j.error); } });
	};
	if(shuffleBtn) shuffleBtn.onclick = ()=>{
		fetch('/shuffle', {method:'POST'}).then(r=>r.json()).then(j=>{
			if(j.status==='OK'){
				shuffleBtn.dataset.on = j.shuffle ? '1':'0';
			}
		});
	};

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
			if(j.status==='OK' && j.volume!=null){ vol.value = Math.round(j.volume); }
		}).catch(()=>{});
	}

	const toggleBtn = document.getElementById('toggleExpand');
	function updateToggleLabel(){
		if(!toggleBtn) return;
		const dirs = Array.from(document.querySelectorAll('#tree .dir'));
		const anyCollapsed = dirs.some(d=>d.classList.contains('collapsed'));
		toggleBtn.textContent = anyCollapsed ? '展开' : '折叠';
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

	// Upload handlers
	const uploadBtn = document.getElementById('uploadBtn');
	const uploadFile = document.getElementById('uploadFile');
	if(uploadBtn && uploadFile){
		uploadBtn.addEventListener('click', ()=> uploadFile.click());
		uploadFile.addEventListener('change', ()=>{
			const file = uploadFile.files[0];
			if(!file) return;
			const ext = file.name.split('.').pop().toLowerCase();
			// Safely read ALLOWED from server-side boot data if present to avoid ReferenceError
			const allowed = (typeof ALLOWED !== 'undefined' && Array.isArray(ALLOWED)) ? Array.from(ALLOWED) : [];
			// ALLOWED in this file may not be global; fall back to common audio extensions
			const can = allowed.length ? allowed : ['mp3','wav','flac'];
			if(!can.includes(ext)){
				alert('只允许上传音频文件 (.mp3 .wav .flac)');
				uploadFile.value = '';
				return;
			}
			const fd = new FormData();
			fd.append('file', file, file.name);
			const uploadStatus = document.getElementById('uploadStatus');
			if(uploadStatus) uploadStatus.textContent = '正在上传...';
			
			fetch('/upload', {method:'POST', body: fd})
				.then(r => {
					if(!r.ok) {
						throw new Error(`HTTP ${r.status} ${r.statusText}`);
					}
					return r.json();
				})
				.then(j=>{
					if(j.status==='OK'){
						alert('上传成功: '+ j.filename);
						// refresh tree from server
						fetch('/tree').then(r=>r.json()).then(tj=>{
							if(tj.status==='OK'){ ctx.tree = tj.tree; render(); }
						}).catch(e => console.warn('刷新目录失败:', e));
					}else{
						throw new Error(j.error || '未知错误');
					}
				})
				.catch(e=>{ 
					console.error('上传错误:', e);
					alert('上传失败: ' + e.message); 
				})
				.finally(()=>{ 
					uploadFile.value = ''; 
					if(uploadStatus) uploadStatus.textContent = '';
				});
		});
	}
})();
