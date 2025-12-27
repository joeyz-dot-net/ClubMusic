# -*- coding: utf-8 -*-
"""
用户设置管理模块
注意：用户设置现在由浏览器 localStorage 管理，此模块仅提供默认值
"""

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class UserSettings:
    """用户设置管理器 - 提供默认值（实际存储在浏览器 localStorage）"""
    
    # 默认设置
    DEFAULT_SETTINGS = {
        "theme": "dark",  # light / dark / auto
        "language": "auto",  # auto / zh / en
    }
    
    def __init__(self):
        """初始化设置管理器"""
        self.settings = self.DEFAULT_SETTINGS.copy()
        logger.info("[设置] UserSettings 已初始化（使用默认值，实际存储在浏览器 localStorage）")
    
    def get(self, key: str, default: Any = None) -> Any:
        """获取单个设置默认值"""
        return self.DEFAULT_SETTINGS.get(key, default)
    
    def set(self, key: str, value: Any) -> bool:
        """设置值（仅保存到内存，实际持久化由浏览器处理）"""
        if key in self.DEFAULT_SETTINGS:
            self.settings[key] = value
            logger.info(f"[设置] {key} = {value}（存储在浏览器 localStorage）")
            return True
        else:
            logger.warning(f"[设置] 未知设置项: {key}")
            return False
    
    def update(self, settings_dict: Dict[str, Any]) -> bool:
        """批量更新设置（仅保存到内存）"""
        valid_keys = set(self.DEFAULT_SETTINGS.keys())
        for key, value in settings_dict.items():
            if key in valid_keys:
                self.settings[key] = value
            else:
                logger.warning(f"[设置] 忽略未知设置项: {key}")
        logger.info("[设置] 批量更新设置（存储在浏览器 localStorage）")
        return True
    
    def get_all(self) -> Dict[str, Any]:
        """获取所有默认设置"""
        return self.DEFAULT_SETTINGS.copy()
    
    def reset(self):
        """重置为默认值"""
        self.settings = self.DEFAULT_SETTINGS.copy()
        logger.info("[设置] 已重置为默认值（请清空浏览器 localStorage 后重新加载）")
        return True


# 全局设置实例
_settings_instance: Optional[UserSettings] = None

def get_settings() -> UserSettings:
    """获取全局设置实例"""
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = UserSettings()
    return _settings_instance

def initialize_settings() -> UserSettings:
    """初始化全局设置实例"""
    global _settings_instance
    _settings_instance = UserSettings()
    return _settings_instance

