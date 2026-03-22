/**
 * 多语言支持模块 (i18n)
 */

const translations = {
    zh: {
        // 设置面板 - 标题和按钮
        'settings.title': '⚙️ 设置',
        'settings.close': '✕',

        // 外观设置
        'settings.appearance': '🎨 外观设置',
        'settings.theme': '主题',
        'settings.theme.dark': '深色主题',
        'settings.theme.light': '浅色主题',
        'settings.theme.auto': '自动',
        'settings.language': '语言',
        'settings.language.auto': '自动选择',
        'settings.language.zh': '中文 (Chinese)',
        'settings.language.zh-TW': '繁體中文 (Traditional Chinese)',
        'settings.language.en': 'English',

        // 按钮
        'settings.reset': '🔄 重置为默认',
        'settings.save': '✓ 保存设置',

        // 消息提示
        'settings.saving': '正在保存设置...',
        'settings.saveSuccess': '设置已保存成功',
        'settings.saveFailed': '保存失败',
        'settings.resetting': '正在重置设置...',
        'settings.resetSuccess': '设置已重置为默认值',
        'settings.resetConfirm': '确定要重置所有设置为默认值吗？',
        'settings.resetFailed': '重置失败',

        // 导航栏
        'nav.queue': '队列',
        'nav.local': '本地',
        'nav.search': '搜索',
        'nav.playlists': '选择歌单',
        'search.history': '播放历史',
        'nav.settings': '设置',
        'nav.debug': '调试',
        'debug.noData': '暂无数据',
        'debug.noLogs': '暂无日志',

        // 播放历史 - 操作菜单
        'history.actionMenu.playNow': '立即播放',
        'history.actionMenu.addToNext': '添加到下一首',
        'history.actionMenu.addToPlaylist': '添加到歌单',
        'history.actionMenu.deleteRecord': '删除此记录',
        'history.search.placeholder': '搜索播放历史...',
        'history.empty': '暂无播放历史',
        'history.deleteSuccess': '已删除播放历史记录',
        'history.deleteFailed': '删除失败',
        'history.playNowSuccess': '正在播放',
        'history.addToNextSuccess': '已添加到下一首',
        'history.addToNextFailed': '添加失败',
        'history.noResults': '没有匹配的结果',
        'history.loading': '📜 加载播放历史...',
        'history.loadFailed': '加载历史失败',
        'history.typeYoutube': '🎬 YouTube',
        'history.typeLocal': '🎵 本地音乐',

        // 页面标题
        'page.title': '飞猪音乐 - 可以在浏览器中后台播放的网络播放器',

        // 播放器控件
        'player.play': '播放',
        'player.pause': '暂停',
        'player.playPause': '播放/暂停',
        'player.volume': '音量',
        'player.prev': '上一首',
        'player.next': '下一首',
        'player.expand': '放大视图',
        'player.collapse': '恢复原始大小',
        'player.pitchDown': '降调',
        'player.pitchUp': '升调',
        'player.videoDelay': '视频延迟 0.2 秒',
        'player.videoAdvance': '视频提前 0.2 秒',
        'player.nowPlaying': '正在播放: {title}',
        'player.playFailed': '播放失败',
        'player.nextFailed': '下一首播放失败',
        'player.prevFailed': '上一首播放失败',
        'player.initFailed': '初始化失败',
        'player.switchFailed': '切换歌单失败',
        'player.preparing': '📀 准备播放歌曲...',
        'player.preparingBusy': '正在准备播放「{title}」，请稍候...',
        'player.prepareTimeout': '播放准备超时，请重试',
        'player.preparingNext': '正在切换下一首，请稍候...',
        'player.preparingPrev': '正在切换上一首，请稍候...',
        'player.loop.off': '不循环',
        'player.loop.single': '单曲循环',
        'player.loop.all': '全部循环',
        'player.loop.title': '循环模式: {mode}',
        'player.shuffle.on': '随机播放: 开启',
        'player.shuffle.off': '随机播放: 关闭',
        'player.shuffle.title': '随机播放',
        'player.notPlaying': '未播放',
        'player.skippedSongs': '已跳过 {count} 首不可用歌曲',
        'player.youtubeAudioOnlyTitle': '视频当前不可用',
        'player.youtubeAudioOnly': '当前视频无法嵌入，正在继续纯音频播放',
        'player.youtubeAudioOnlyBody': '这是 YouTube 对嵌入播放的限制，音频会继续正常播放。',
        'player.youtubeVideoSkipped': 'YouTube 视频无法嵌入，已切换为纯音频播放: {title}',

        // 搜索
        'search.title': '搜索结果',
        'search.placeholder': '搜索歌曲、艺术家...',
        'search.karaoke': '伴奏',
        'search.clearHistory': '清空历史',
        'search.streamMusic': '搜索串流音乐',
        'search.searching': '🔍 正在搜索...',
        'search.loadingRes': '正在检索本地和网络资源...',
        'search.failed': '搜索失败: {error}',
        'search.inputPrompt': '输入关键词搜索歌曲',
        'search.noResults': '暂无结果',
        'search.localTab': '本地 ({count})',
        'search.networkTab': '网络 ({count})',
        'search.loadMore': '加载更多 ({count})',
        'search.loadAll': '加载全部',
        'search.loadingMore': '正在加载...',
        'search.allLoaded': '已加载全部结果',
        'search.history.title': '最近搜索',
        'search.history.delete': '删除此搜索',
        'search.typeDirectory': '📁 目录',
        'search.actionMenu.playNow': '立即播放',
        'search.actionMenu.addToQueue': '添加到队列',
        'search.actionMenu.addToPlaylist': '添加到歌单',
        'search.actionMenu.addToPlaylistNamed': '添加到「{name}」',
        'search.actionMenu.addAll': '添加全部({count})到「{name}」',
        'search.confirmPlayNow': '确认立即播放',
        'search.confirmPlayNowMsg': '立即播放会跳过当前播放歌曲，并缓冲15-30秒才会开始播放',
        'search.confirmPlayNowBtn': '确认播放',
        'search.dirNotSupported': '目录暂不支持立即播放，请选择添加到队列',
        'search.addSongFailed': '添加歌曲失败',
        'search.nowPlaying': '▶️ 正在播放: {title}',
        'search.playFailed': '播放失败',
        'search.loadingDir': '⏳ 加载中...',
        'search.getDirFailed': '获取目录歌曲失败',
        'search.noMusicInDir': '目录中没有音乐文件',
        'search.addDirSuccess': '➕ 已添加 {count} 首歌曲到「{name}」',
        'search.addDirFailed': '添加目录失败',
        'search.addSuccess': '➕ 已添加到「{name}」: {title}',
        'search.alreadyInList': '已在播放列表中',
        'search.addFailed': '添加失败',
        'search.noResultsToAdd': '没有可添加的搜索结果',
        'search.noValidSongs': '搜索结果中没有有效的歌曲',
        'search.batchAddInfo': '正在添加 {count} 首歌曲到歌单...',
        'search.batchAddLoading': '正在添加 {count} 首歌曲...',
        'search.batchAddProgress': '添加中... {done}/{total} ({pct}%)',
        'search.batchAddSuccess': '✅ 已添加 {done}/{total} 首歌曲到「{name}」',
        'search.batchAddFailed': '批量添加失败',
        'search.queryEmpty': '搜索关键词不能为空',
        'search.loadedMore': '已加载 {count} 个新结果',
        'search.loadMoreFailed': '加载失败',
        'search.breadcrumb': '搜索结果',
        'search.cannotLoadDir': '无法加载目录数据',
        'search.dirNotFound': '找不到该目录',

        // 曲目
        'track.unknown': '未知歌曲',
        'track.unknownLocation': '未知位置',
        'track.unknownDuration': '未知时长',
        'track.typeLocal': '本地',
        'track.typeDirectory': '目录',

        // 本地文件
        'local.home': '本地歌曲',
        'local.empty': '暂无本地文件',
        'local.dirEmpty': '此目录为空',
        'local.backToPlaylist': '返回歌单',
        'local.musicType': '本地音乐',
        'local.songCount': '{count} 首歌曲',

        // 播放列表
        'playlist.current': '当前播放列表',
        'playlist.unnamed': '未命名歌单',
        'playlist.noSongs': '📭 暂无歌曲',
        'playlist.songCount': '📊 {count} 首歌曲',
        'playlist.deleteConfirm': '确定删除《{title}》吗？',
        'playlist.clearQueueConfirm': '确定要清空队列吗？',
        'playlist.clearPlaylistConfirm': '确定要清空歌单「{name}」吗？',
        'playlist.deleted': '已删除',
        'playlist.deleteFailed': '删除失败',
        'playlist.clearPlaylistSucceed': '✅ 歌单「{name}」已清空',
        'playlist.clearSucceed': '✅ 队列已清空',
        'playlist.clearFailed': '清空失败',
        'playlist.returnedToQueue': '✅ 已返回队列',
        'playlist.reordered': '已调整顺序',
        'playlist.reorderFailed': '调整失败',
        'playlist.clearQueue': '清空播放队列',
        'playlist.returnToQueue': '返回到队列（默认歌单）',
        'playlist.addAll': '添加全部歌曲到队列',
        'playlist.clearPlaylist': '清空歌单',
        'playlist.addingAll': '📀 正在添加 {count} 首歌曲...',
        'playlist.addProgress': '📀 添加中... {done}/{total} ({pct}%)',
        'playlist.addSuccess': '✅ 成功添加 {count} 首歌曲',
        'playlist.addSkipped': '，跳过 {count} 首（已存在）',
        'playlist.addFailed': '，失败 {count} 首',
        'playlist.addToQueue': '✅ 已添加到「队列」: {title}',
        'playlist.opFailed': '操作失败',
        'playlist.songUnavailable': '文件不存在，已自动跳过',

        // 歌单管理
        'playlists.select': '选择歌单',
        'playlists.empty': '暂无歌单',
        'playlists.createHint': '点击右上角 + 创建新歌单',
        'playlists.defaultBadge': '默认',
        'playlists.roomBadge': '房间',
        'playlists.create': '创建歌单',
        'playlists.createPrompt': '请输入歌单名称：',
        'playlists.renamePrompt': '编辑歌单名称：',
        'playlists.editAction': '编辑歌单',
        'playlists.deleteAction': '删除歌单',
        'playlists.createSuccess': '✅ 歌单创建成功',
        'playlists.createFailed': '❌ 创建失败: {error}',
        'playlists.renameSuccess': '✏️ 歌单已重命名',
        'playlists.renameFailed': '❌ 重命名失败: {error}',
        'playlists.deleteConfirmTitle': '确定要删除歌单"{name}"吗？',
        'playlists.deleteConfirmMsg': '该歌单包含 {count} 首歌曲，删除后无法恢复。',
        'playlists.deleteSuccess': '🗑️ 歌单已删除',
        'playlists.deleteFailed': '❌ 删除失败: {error}',
        'playlists.switchSuccess': '📋 已切换到：{name}',
        'playlists.switchFailed': '❌ 切换失败: {error}',

        // 通用 Modal
        'modal.confirm': '确认',
        'modal.cancel': '取消',
        'modal.close': '关闭',

        // 加载状态
        'loading.default': '加载中...',
        'loading.preparing': '📀 准备播放歌曲...',
    },
    en: {
        // Settings panel - Titles and buttons
        'settings.title': '⚙️ Settings',
        'settings.close': '✕',

        // Appearance settings
        'settings.appearance': '🎨 Appearance',
        'settings.theme': 'Theme',
        'settings.theme.dark': 'Dark Theme',
        'settings.theme.light': 'Light Theme',
        'settings.theme.auto': 'Auto',
        'settings.language': 'Language',
        'settings.language.auto': 'Auto Select',
        'settings.language.zh': '中文 (Chinese)',
        'settings.language.zh-TW': '繁體中文 (Traditional Chinese)',
        'settings.language.en': 'English',

        // Buttons
        'settings.reset': '🔄 Reset to Default',
        'settings.save': '✓ Save Settings',

        // Messages
        'settings.saving': 'Saving settings...',
        'settings.saveSuccess': 'Settings saved successfully',
        'settings.saveFailed': 'Save failed',
        'settings.resetting': 'Resetting settings...',
        'settings.resetSuccess': 'Settings have been reset to defaults',
        'settings.resetConfirm': 'Are you sure you want to reset all settings to defaults?',
        'settings.resetFailed': 'Reset failed',

        // Navigation
        'nav.queue': 'Queue',
        'nav.local': 'Local',
        'nav.search': 'Search',
        'nav.playlists': 'Select Playlist',
        'search.history': 'Playback History',
        'nav.settings': 'Settings',
        'nav.debug': 'Debug',
        'debug.noData': 'No data',
        'debug.noLogs': 'No logs',

        // Play history - Action menu
        'history.actionMenu.playNow': 'Play Now',
        'history.actionMenu.addToNext': 'Add to Next',
        'history.actionMenu.addToPlaylist': 'Add to Playlist',
        'history.actionMenu.deleteRecord': 'Delete Record',
        'history.search.placeholder': 'Search play history...',
        'history.empty': 'No playback history',
        'history.deleteSuccess': 'History record deleted',
        'history.deleteFailed': 'Delete failed',
        'history.playNowSuccess': 'Now playing',
        'history.addToNextSuccess': 'Added as next song',
        'history.addToNextFailed': 'Failed to add',
        'history.noResults': 'No matching results',
        'history.loading': '📜 Loading history...',
        'history.loadFailed': 'Failed to load history',
        'history.typeYoutube': '🎬 YouTube',
        'history.typeLocal': '🎵 Local Music',

        // Page title
        'page.title': 'FlyPig Music - A web player that plays in background',

        // Player controls
        'player.play': 'Play',
        'player.pause': 'Pause',
        'player.playPause': 'Play/Pause',
        'player.volume': 'Volume',
        'player.prev': 'Previous',
        'player.next': 'Next',
        'player.expand': 'Expand View',
        'player.collapse': 'Restore Size',
        'player.pitchDown': 'Pitch Down',
        'player.pitchUp': 'Pitch Up',
        'player.videoDelay': 'Video delay 0.2s',
        'player.videoAdvance': 'Video advance 0.2s',
        'player.nowPlaying': 'Now playing: {title}',
        'player.playFailed': 'Play failed',
        'player.nextFailed': 'Failed to play next',
        'player.prevFailed': 'Failed to play previous',
        'player.initFailed': 'Initialization failed',
        'player.switchFailed': 'Failed to switch playlist',
        'player.preparing': '📀 Preparing playback...',
        'player.preparingBusy': 'Preparing "{title}", please wait...',
        'player.prepareTimeout': 'Play preparation timed out, please retry',
        'player.preparingNext': 'Switching to next, please wait...',
        'player.preparingPrev': 'Switching to previous, please wait...',
        'player.loop.off': 'No Loop',
        'player.loop.single': 'Single Loop',
        'player.loop.all': 'Loop All',
        'player.loop.title': 'Loop mode: {mode}',
        'player.shuffle.on': 'Shuffle: On',
        'player.shuffle.off': 'Shuffle: Off',
        'player.shuffle.title': 'Shuffle',
        'player.notPlaying': 'Not playing',
        'player.skippedSongs': 'Skipped {count} unavailable song(s)',
        'player.youtubeAudioOnlyTitle': 'Video Unavailable',
        'player.youtubeAudioOnly': 'This video cannot be embedded, continuing with audio only',
        'player.youtubeAudioOnlyBody': 'YouTube blocks embedded playback for this video, but audio continues normally.',
        'player.youtubeVideoSkipped': 'YouTube video could not be embedded, continuing with audio only: {title}',

        // Search
        'search.title': 'Search Results',
        'search.placeholder': 'Search songs, artists...',
        'search.karaoke': 'Karaoke',
        'search.clearHistory': 'Clear History',
        'search.streamMusic': 'Search streaming music',
        'search.searching': '🔍 Searching...',
        'search.loadingRes': 'Searching local and online resources...',
        'search.failed': 'Search failed: {error}',
        'search.inputPrompt': 'Enter keywords to search songs',
        'search.noResults': 'No results',
        'search.localTab': 'Local ({count})',
        'search.networkTab': 'Online ({count})',
        'search.loadMore': 'Load more ({count})',
        'search.loadAll': 'Load All',
        'search.loadingMore': 'Loading...',
        'search.allLoaded': 'All results loaded',
        'search.history.title': 'Recent Searches',
        'search.history.delete': 'Delete this search',
        'search.typeDirectory': '📁 Directory',
        'search.actionMenu.playNow': 'Play Now',
        'search.actionMenu.addToQueue': 'Add to Queue',
        'search.actionMenu.addToPlaylist': 'Add to Playlist',
        'search.actionMenu.addToPlaylistNamed': 'Add to "{name}"',
        'search.actionMenu.addAll': 'Add All ({count}) to "{name}"',
        'search.confirmPlayNow': 'Confirm Play Now',
        'search.confirmPlayNowMsg': 'Playing now will skip the current song and buffer for 15-30 seconds before starting.',
        'search.confirmPlayNowBtn': 'Confirm Play',
        'search.dirNotSupported': 'Directory playback is not supported, please add to queue',
        'search.addSongFailed': 'Failed to add song',
        'search.nowPlaying': '▶️ Now playing: {title}',
        'search.playFailed': 'Play failed',
        'search.loadingDir': '⏳ Loading...',
        'search.getDirFailed': 'Failed to get directory songs',
        'search.noMusicInDir': 'No music files in directory',
        'search.addDirSuccess': '➕ Added {count} songs to "{name}"',
        'search.addDirFailed': 'Failed to add directory',
        'search.addSuccess': '➕ Added to "{name}": {title}',
        'search.alreadyInList': 'Already in playlist',
        'search.addFailed': 'Add failed',
        'search.noResultsToAdd': 'No search results to add',
        'search.noValidSongs': 'No valid songs in search results',
        'search.batchAddInfo': 'Adding {count} songs to playlist...',
        'search.batchAddLoading': 'Adding {count} songs...',
        'search.batchAddProgress': 'Adding... {done}/{total} ({pct}%)',
        'search.batchAddSuccess': '✅ Added {done}/{total} songs to "{name}"',
        'search.batchAddFailed': 'Batch add failed',
        'search.queryEmpty': 'Search query cannot be empty',
        'search.loadedMore': 'Loaded {count} new results',
        'search.loadMoreFailed': 'Load failed',
        'search.breadcrumb': 'Search Results',
        'search.cannotLoadDir': 'Cannot load directory data',
        'search.dirNotFound': 'Directory not found',

        // Track
        'track.unknown': 'Unknown Song',
        'track.unknownLocation': 'Unknown location',
        'track.unknownDuration': 'Unknown duration',
        'track.typeLocal': 'Local',
        'track.typeDirectory': 'Directory',

        // Local files
        'local.home': 'Local Songs',
        'local.empty': 'No local files',
        'local.dirEmpty': 'Directory is empty',
        'local.backToPlaylist': 'Back to playlist',
        'local.musicType': 'Local Music',
        'local.songCount': '{count} songs',

        // Playlist
        'playlist.current': 'Current Playlist',
        'playlist.unnamed': 'Unnamed Playlist',
        'playlist.noSongs': '📭 No songs',
        'playlist.songCount': '📊 {count} songs',
        'playlist.deleteConfirm': 'Delete "{title}"?',
        'playlist.clearQueueConfirm': 'Clear the queue?',
        'playlist.clearPlaylistConfirm': 'Clear playlist "{name}"?',
        'playlist.deleted': 'Deleted',
        'playlist.deleteFailed': 'Delete failed',
        'playlist.clearPlaylistSucceed': '✅ Playlist "{name}" cleared',
        'playlist.clearSucceed': '✅ Queue cleared',
        'playlist.clearFailed': 'Clear failed',
        'playlist.returnedToQueue': '✅ Back to queue',
        'playlist.reordered': 'Reordered',
        'playlist.reorderFailed': 'Reorder failed',
        'playlist.clearQueue': 'Clear Queue',
        'playlist.returnToQueue': 'Return to Queue',
        'playlist.addAll': 'Add All to Queue',
        'playlist.clearPlaylist': 'Clear Playlist',
        'playlist.addingAll': '📀 Adding {count} songs...',
        'playlist.addProgress': '📀 Adding... {done}/{total} ({pct}%)',
        'playlist.addSuccess': '✅ Added {count} songs',
        'playlist.addSkipped': ', skipped {count} (already exists)',
        'playlist.addFailed': ', {count} failed',
        'playlist.addToQueue': '✅ Added to queue: {title}',
        'playlist.opFailed': 'Operation failed',
        'playlist.songUnavailable': 'File not found, skipped',

        // Playlists management
        'playlists.select': 'Select Playlist',
        'playlists.empty': 'No playlists',
        'playlists.createHint': 'Tap + to create a playlist',
        'playlists.defaultBadge': 'Default',
        'playlists.roomBadge': 'Room',
        'playlists.create': 'Create Playlist',
        'playlists.createPrompt': 'Playlist name:',
        'playlists.renamePrompt': 'Edit playlist name:',
        'playlists.editAction': 'Edit playlist',
        'playlists.deleteAction': 'Delete playlist',
        'playlists.createSuccess': '✅ Playlist created',
        'playlists.createFailed': '❌ Failed to create: {error}',
        'playlists.renameSuccess': '✏️ Playlist renamed',
        'playlists.renameFailed': '❌ Rename failed: {error}',
        'playlists.deleteConfirmTitle': 'Delete playlist "{name}"?',
        'playlists.deleteConfirmMsg': 'This playlist has {count} songs and cannot be recovered.',
        'playlists.deleteSuccess': '🗑️ Playlist deleted',
        'playlists.deleteFailed': '❌ Delete failed: {error}',
        'playlists.switchSuccess': '📋 Switched to: {name}',
        'playlists.switchFailed': '❌ Switch failed: {error}',

        // Common Modal
        'modal.confirm': 'Confirm',
        'modal.cancel': 'Cancel',
        'modal.close': 'Close',

        // Loading states
        'loading.default': 'Loading...',
        'loading.preparing': '📀 Preparing playback...',
    },
    'zh-TW': {
        // 設定面板 - 標題和按鈕
        'settings.title': '⚙️ 設定',
        'settings.close': '✕',

        // 外觀設定
        'settings.appearance': '🎨 外觀設定',
        'settings.theme': '主題',
        'settings.theme.dark': '深色主題',
        'settings.theme.light': '淺色主題',
        'settings.theme.auto': '自動',
        'settings.language': '語言',
        'settings.language.auto': '自動選擇',
        'settings.language.zh': '中文 (简体)',
        'settings.language.zh-TW': '繁體中文',
        'settings.language.en': 'English',

        // 按鈕
        'settings.reset': '🔄 重設為預設值',
        'settings.save': '✓ 儲存設定',

        // 訊息提示
        'settings.saving': '正在儲存設定...',
        'settings.saveSuccess': '設定已儲存成功',
        'settings.saveFailed': '儲存失敗',
        'settings.resetting': '正在重設設定...',
        'settings.resetSuccess': '設定已重設為預設值',
        'settings.resetConfirm': '確定要將所有設定重設為預設值嗎？',
        'settings.resetFailed': '重設失敗',

        // 導覽列
        'nav.queue': '播放佇列',
        'nav.local': '本機',
        'nav.search': '搜尋',
        'nav.playlists': '選擇歌單',
        'search.history': '播放記錄',
        'nav.settings': '設定',
        'nav.debug': '除錯',
        'debug.noData': '暫無資料',
        'debug.noLogs': '暫無日誌',

        // 播放記錄 - 操作選單
        'history.actionMenu.playNow': '立即播放',
        'history.actionMenu.addToNext': '新增至下一首',
        'history.actionMenu.addToPlaylist': '新增至歌單',
        'history.actionMenu.deleteRecord': '刪除此記錄',
        'history.search.placeholder': '搜尋播放記錄...',
        'history.empty': '目前沒有播放記錄',
        'history.deleteSuccess': '已刪除播放記錄',
        'history.deleteFailed': '刪除失敗',
        'history.playNowSuccess': '正在播放',
        'history.addToNextSuccess': '已新增至下一首',
        'history.addToNextFailed': '新增失敗',
        'history.noResults': '沒有符合的結果',
        'history.loading': '📜 載入播放記錄...',
        'history.loadFailed': '載入記錄失敗',
        'history.typeYoutube': '🎬 YouTube',
        'history.typeLocal': '🎵 本機音樂',

        // 頁面標題
        'page.title': '飛豬音樂 - 可在瀏覽器中背景播放的網路播放器',

        // 播放器控制
        'player.play': '播放',
        'player.pause': '暫停',
        'player.playPause': '播放/暫停',
        'player.volume': '音量',
        'player.prev': '上一首',
        'player.next': '下一首',
        'player.expand': '放大視圖',
        'player.collapse': '恢復原始大小',
        'player.pitchDown': '降調',
        'player.pitchUp': '升調',
        'player.videoDelay': '視訊延遲 0.2 秒',
        'player.videoAdvance': '視訊提前 0.2 秒',
        'player.nowPlaying': '正在播放: {title}',
        'player.playFailed': '播放失敗',
        'player.nextFailed': '下一首播放失敗',
        'player.prevFailed': '上一首播放失敗',
        'player.initFailed': '初始化失敗',
        'player.switchFailed': '切換歌單失敗',
        'player.preparing': '📀 準備播放歌曲...',
        'player.preparingBusy': '正在準備播放「{title}」，請稍候...',
        'player.prepareTimeout': '播放準備逾時，請重試',
        'player.preparingNext': '正在切換下一首，請稍候...',
        'player.preparingPrev': '正在切換上一首，請稍候...',
        'player.loop.off': '不循環',
        'player.loop.single': '單曲循環',
        'player.loop.all': '全部循環',
        'player.loop.title': '循環模式: {mode}',
        'player.shuffle.on': '隨機播放: 開啟',
        'player.shuffle.off': '隨機播放: 關閉',
        'player.shuffle.title': '隨機播放',
        'player.notPlaying': '未播放',
        'player.skippedSongs': '已跳過 {count} 首不可用歌曲',
        'player.youtubeAudioOnlyTitle': '影片目前無法顯示',
        'player.youtubeAudioOnly': '目前影片無法嵌入，正在繼續純音訊播放',
        'player.youtubeAudioOnlyBody': '這是 YouTube 的嵌入限制，音訊會繼續正常播放。',
        'player.youtubeVideoSkipped': 'YouTube 視訊無法嵌入，已切換為純音訊播放: {title}',

        // 搜尋
        'search.title': '搜尋結果',
        'search.placeholder': '搜尋歌曲、藝術家...',
        'search.karaoke': '伴奏',
        'search.clearHistory': '清除歷史',
        'search.streamMusic': '搜尋串流音樂',
        'search.searching': '🔍 正在搜尋...',
        'search.loadingRes': '正在檢索本機和網路資源...',
        'search.failed': '搜尋失敗: {error}',
        'search.inputPrompt': '輸入關鍵字搜尋歌曲',
        'search.noResults': '暫無結果',
        'search.localTab': '本機 ({count})',
        'search.networkTab': '網路 ({count})',
        'search.loadMore': '載入更多 ({count})',
        'search.loadAll': '載入全部',
        'search.loadingMore': '正在載入...',
        'search.allLoaded': '已載入全部結果',
        'search.history.title': '最近搜尋',
        'search.history.delete': '刪除此搜尋',
        'search.typeDirectory': '📁 目錄',
        'search.actionMenu.playNow': '立即播放',
        'search.actionMenu.addToQueue': '加入佇列',
        'search.actionMenu.addToPlaylist': '新增至歌單',
        'search.actionMenu.addToPlaylistNamed': '新增至「{name}」',
        'search.actionMenu.addAll': '新增全部({count})至「{name}」',
        'search.confirmPlayNow': '確認立即播放',
        'search.confirmPlayNowMsg': '立即播放會跳過目前播放歌曲，並緩衝15-30秒才會開始播放',
        'search.confirmPlayNowBtn': '確認播放',
        'search.dirNotSupported': '目錄暫不支援立即播放，請選擇加入佇列',
        'search.addSongFailed': '新增歌曲失敗',
        'search.nowPlaying': '▶️ 正在播放: {title}',
        'search.playFailed': '播放失敗',
        'search.loadingDir': '⏳ 載入中...',
        'search.getDirFailed': '取得目錄歌曲失敗',
        'search.noMusicInDir': '目錄中沒有音樂檔案',
        'search.addDirSuccess': '➕ 已新增 {count} 首歌曲至「{name}」',
        'search.addDirFailed': '新增目錄失敗',
        'search.addSuccess': '➕ 已新增至「{name}」: {title}',
        'search.alreadyInList': '已在播放清單中',
        'search.addFailed': '新增失敗',
        'search.noResultsToAdd': '沒有可新增的搜尋結果',
        'search.noValidSongs': '搜尋結果中沒有有效的歌曲',
        'search.batchAddInfo': '正在新增 {count} 首歌曲至歌單...',
        'search.batchAddLoading': '正在新增 {count} 首歌曲...',
        'search.batchAddProgress': '新增中... {done}/{total} ({pct}%)',
        'search.batchAddSuccess': '✅ 已新增 {done}/{total} 首歌曲至「{name}」',
        'search.batchAddFailed': '批次新增失敗',
        'search.queryEmpty': '搜尋關鍵字不能為空',
        'search.loadedMore': '已載入 {count} 個新結果',
        'search.loadMoreFailed': '載入失敗',
        'search.breadcrumb': '搜尋結果',
        'search.cannotLoadDir': '無法載入目錄資料',
        'search.dirNotFound': '找不到該目錄',

        // 曲目
        'track.unknown': '未知歌曲',
        'track.unknownLocation': '未知位置',
        'track.unknownDuration': '未知時長',
        'track.typeLocal': '本機',
        'track.typeDirectory': '目錄',

        // 本機檔案
        'local.home': '本機歌曲',
        'local.empty': '尚無本機檔案',
        'local.dirEmpty': '此目錄為空',
        'local.backToPlaylist': '返回歌單',
        'local.musicType': '本機音樂',
        'local.songCount': '{count} 首歌曲',

        // 播放清單
        'playlist.current': '目前播放清單',
        'playlist.unnamed': '未命名歌單',
        'playlist.noSongs': '📭 暫無歌曲',
        'playlist.songCount': '📊 {count} 首歌曲',
        'playlist.deleteConfirm': '確定刪除《{title}》嗎？',
        'playlist.clearQueueConfirm': '確定要清空佇列嗎？',
        'playlist.clearPlaylistConfirm': '確定要清空歌單「{name}」嗎？',
        'playlist.deleted': '已刪除',
        'playlist.deleteFailed': '刪除失敗',
        'playlist.clearPlaylistSucceed': '✅ 歌單「{name}」已清空',
        'playlist.clearSucceed': '✅ 佇列已清空',
        'playlist.clearFailed': '清空失敗',
        'playlist.returnedToQueue': '✅ 已返回佇列',
        'playlist.reordered': '已調整順序',
        'playlist.reorderFailed': '調整失敗',
        'playlist.clearQueue': '清空播放佇列',
        'playlist.returnToQueue': '返回佇列（預設歌單）',
        'playlist.addAll': '全部加入佇列',
        'playlist.clearPlaylist': '清空歌單',
        'playlist.addingAll': '📀 正在新增 {count} 首歌曲...',
        'playlist.addProgress': '📀 新增中... {done}/{total} ({pct}%)',
        'playlist.addSuccess': '✅ 成功新增 {count} 首歌曲',
        'playlist.addSkipped': '，跳過 {count} 首（已存在）',
        'playlist.addFailed': '，失敗 {count} 首',
        'playlist.addToQueue': '✅ 已加入佇列: {title}',
        'playlist.opFailed': '操作失敗',
        'playlist.songUnavailable': '檔案不存在，已自動跳過',

        // 歌單管理
        'playlists.select': '選擇歌單',
        'playlists.empty': '尚無歌單',
        'playlists.createHint': '點選右上角 + 建立新歌單',
        'playlists.defaultBadge': '預設',
        'playlists.roomBadge': '房間',
        'playlists.create': '建立歌單',
        'playlists.createPrompt': '請輸入歌單名稱：',
        'playlists.renamePrompt': '編輯歌單名稱：',
        'playlists.editAction': '編輯歌單',
        'playlists.deleteAction': '刪除歌單',
        'playlists.createSuccess': '✅ 歌單建立成功',
        'playlists.createFailed': '❌ 建立失敗: {error}',
        'playlists.renameSuccess': '✏️ 歌單已重新命名',
        'playlists.renameFailed': '❌ 重新命名失敗: {error}',
        'playlists.deleteConfirmTitle': '確定要刪除歌單「{name}」嗎？',
        'playlists.deleteConfirmMsg': '此歌單包含 {count} 首歌曲，刪除後無法復原。',
        'playlists.deleteSuccess': '🗑️ 歌單已刪除',
        'playlists.deleteFailed': '❌ 刪除失敗: {error}',
        'playlists.switchSuccess': '📋 已切換至：{name}',
        'playlists.switchFailed': '❌ 切換失敗: {error}',

        // 通用 Modal
        'modal.confirm': '確認',
        'modal.cancel': '取消',
        'modal.close': '關閉',

        // 載入狀態
        'loading.default': '載入中...',
        'loading.preparing': '📀 準備播放歌曲...',
    }
};

export const i18n = {
    currentLanguage: null,
    languageChangeListeners: [],

    /**
     * 初始化 i18n，自动检测语言
     */
    init() {
        const savedLanguage = localStorage.getItem('language');
        if (savedLanguage && translations[savedLanguage]) {
            this.currentLanguage = savedLanguage;
        } else {
            this.currentLanguage = this.detectBrowserLanguage();
            localStorage.setItem('language', this.currentLanguage);
        }
        console.log(`[i18n] 已初始化，当前语言: ${this.currentLanguage}`);
        this.updatePageText();
    },

    /**
     * 检测浏览器语言
     */
    detectBrowserLanguage() {
        const browserLanguages = navigator.languages
            ? Array.from(navigator.languages)
            : [navigator.language || navigator.userLanguage];

        const languageMap = {
            'zh': 'zh', 'zh-CN': 'zh', 'zh-Hans': 'zh', 'zh-Hans-CN': 'zh',
            'zh-TW': 'zh-TW', 'zh-HK': 'zh-TW', 'zh-MO': 'zh-TW',
            'zh-Hant': 'zh-TW', 'zh-Hant-TW': 'zh-TW', 'zh-Hant-HK': 'zh-TW',
            'en': 'en', 'en-US': 'en', 'en-GB': 'en',
        };

        for (const browserLang of browserLanguages) {
            if (languageMap[browserLang]) return languageMap[browserLang];
            const prefix = browserLang.split('-')[0];
            if (languageMap[prefix]) return languageMap[prefix];
        }
        return 'zh';
    },

    /**
     * 获取翻译文本，支持插值
     * @param {string} key - 翻译键
     * @param {Object|string} params - 插值参数对象，或语言代码（向后兼容）
     * @param {string} language - 语言代码（可选）
     */
    t(key, params = {}, language = null) {
        // 向后兼容：第二个参数如果是字符串，视为 language
        if (typeof params === 'string') {
            language = params;
            params = {};
        }
        const lang = language || this.currentLanguage;
        let text = translations[lang]?.[key] || translations['zh']?.[key] || key;
        if (params && typeof params === 'object') {
            Object.keys(params).forEach(k => {
                text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
            });
        }
        return text;
    },

    onLanguageChange(callback) {
        if (typeof callback === 'function') {
            this.languageChangeListeners.push(callback);
        }
    },

    offLanguageChange(callback) {
        this.languageChangeListeners = this.languageChangeListeners.filter(
            listener => listener !== callback
        );
    },

    notifyLanguageChange() {
        this.languageChangeListeners.forEach(callback => {
            try { callback(this.currentLanguage); }
            catch (err) { console.error('[i18n] 语言改变回调出错:', err); }
        });
    },

    setLanguage(language) {
        if (translations[language]) {
            this.currentLanguage = language;
            localStorage.setItem('language', language);
            console.log(`[i18n] 已切换到语言: ${language}`);
            this.updatePageText();
            this.notifyLanguageChange();
        }
    },

    getAvailableLanguages() {
        return Object.keys(translations);
    },

    /**
     * 更新页面元素文本 - 支持 4 种 data-i18n* 属性
     */
    updatePageText() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = this.t(el.getAttribute('data-i18n'));
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = this.t(el.getAttribute('data-i18n-title'));
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = this.t(el.getAttribute('data-i18n-placeholder'));
        });
        document.querySelectorAll('[data-i18n-aria]').forEach(el => {
            el.setAttribute('aria-label', this.t(el.getAttribute('data-i18n-aria')));
        });
        document.title = this.t('page.title');
    }
};
