# -*- coding: utf-8 -*-
"""
ClubMusic 启动器（薄包装）
实际逻辑在 main.py 中，此文件仅保留向后兼容的入口。
"""
import traceback

from main import main


def run_cli() -> int:
    try:
        main()
        return 0
    except KeyboardInterrupt:
        print("\n[启动器] 用户中断启动")
        return 0
    except SystemExit as exc:
        code = exc.code
        if code is None:
            return 0
        return code if isinstance(code, int) else 1
    except Exception as exc:
        print(f"\n[启动器] 未处理异常: {type(exc).__name__}: {exc}")
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(run_cli())
