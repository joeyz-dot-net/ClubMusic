(() => {
	// YouTube modal logic moved here from index.html to keep JS/CSS separate
	const youtubeBtn = document.getElementById('youtubeBtn');
	const youtubeModal = document.getElementById('youtubeModal');
	const youtubeInput = document.getElementById('youtubeInput');
	const youtubeStatus = document.getElementById('youtubeStatus');
	const youtubeCancel = document.getElementById('youtubeCancel');
	const youtubeSubmit = document.getElementById('youtubeSubmit');

	function openModal(){
		youtubeModal.style.display = 'flex';
		youtubeModal.setAttribute('aria-hidden','false');
		document.body.classList.add('modal-open');
		youtubeStatus.textContent = '';
		// small delay so mobile will focus properly
		setTimeout(()=>{ try{ youtubeInput.focus(); }catch(e){} }, 120);
	}

	function closeModal(){
		youtubeModal.style.display = 'none';
		youtubeModal.setAttribute('aria-hidden','true');
		document.body.classList.remove('modal-open');
	}

	youtubeBtn.addEventListener('click', openModal);
	youtubeCancel && youtubeCancel.addEventListener('click', closeModal);

	youtubeSubmit && youtubeSubmit.addEventListener('click', ()=>{
		const url = (youtubeInput.value || '').trim();
		if(!url || !url.startsWith('http')){
			youtubeStatus.textContent = '请输入有效的YouTube视频地址';
			return;
		}
		youtubeStatus.textContent = '正在开始流式播放...';
		console.debug('[UI] play_youtube 请求:', url);
		fetch('/play_youtube', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: 'url=' + encodeURIComponent(url)
		}).then(r => r.json()).then(res => {
			console.debug('[UI] /play_youtube 响应:', res);
			if(res && res.status === 'OK'){
				youtubeStatus.textContent = '已开始流式播放！';
				setTimeout(closeModal, 900);
			}else{
				youtubeStatus.textContent = '播放失败：' + (res && res.error || '未知错误');
			}
		}).catch(e=>{
			console.error('[UI] play_youtube 请求失败', e);
			youtubeStatus.textContent = '请求失败：' + e;
		});
	});

	// ESC关闭弹窗
	window.addEventListener('keydown', e => {
		if (e.key === 'Escape' && youtubeModal && youtubeModal.style.display === 'flex') {
			closeModal();
		}
	});

})();
