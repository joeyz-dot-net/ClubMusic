"""
PCM Named Pipe Server — Windows Named Pipe 服务端，用于将 MPV 的 PCM 音频数据
中继给 ClubVoice。

使用 ctypes 调用 Windows kernel32 API，无需 pywin32 依赖。

管道模式: OUTBOUND + BYTE + WAIT（服务端只写、字节流、同步阻塞）
"""
import ctypes
import ctypes.wintypes as wintypes
import logging
import os

logger = logging.getLogger("pcm_pipe")

# ---------- Windows 常量 ----------
PIPE_ACCESS_OUTBOUND = 0x00000002
PIPE_TYPE_BYTE = 0x00000000
PIPE_READMODE_BYTE = 0x00000000
PIPE_WAIT = 0x00000000
INVALID_HANDLE_VALUE = wintypes.HANDLE(-1).value
ERROR_PIPE_CONNECTED = 535
ERROR_NO_DATA = 232
ERROR_BROKEN_PIPE = 109

_kernel32 = ctypes.windll.kernel32 if os.name == "nt" else None


class PcmPipeServer:
    """Windows Named Pipe Server for PCM audio relay.

    Usage::

        server = PcmPipeServer(r'\\\\.\\pipe\\pcm-my_room')
        server.create()          # 创建管道
        server.wait_for_client() # 阻塞等待 ClubVoice 连接
        server.write(pcm_bytes)  # 写入 PCM 数据
        server.disconnect_client()
        server.close()
    """

    def __init__(self, pipe_name: str, buffer_size: int = 65536):
        self.pipe_name = pipe_name
        self._buffer_size = buffer_size
        self._handle: int | None = None
        self._client_connected = False

    # ---------- 生命周期 ----------

    def create(self) -> bool:
        """创建 Named Pipe Server。成功返回 True。"""
        if _kernel32 is None:
            logger.error("[PcmPipeServer] 仅支持 Windows")
            return False

        handle = _kernel32.CreateNamedPipeW(
            self.pipe_name,
            PIPE_ACCESS_OUTBOUND,
            PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
            1,                  # nMaxInstances
            self._buffer_size,  # nOutBufferSize
            0,                  # nInBufferSize
            0,                  # nDefaultTimeOut (使用系统默认)
            None,               # lpSecurityAttributes
        )

        if handle == INVALID_HANDLE_VALUE:
            err = ctypes.GetLastError()
            logger.error(f"[PcmPipeServer] CreateNamedPipe 失败: error={err}, pipe={self.pipe_name}")
            return False

        self._handle = handle
        logger.info(f"[PcmPipeServer] 管道已创建: {self.pipe_name}")
        return True

    def wait_for_client(self) -> bool:
        """阻塞等待客户端连接。返回 True 表示已连接。"""
        if self._handle is None:
            return False

        result = _kernel32.ConnectNamedPipe(self._handle, None)
        if not result:
            err = ctypes.GetLastError()
            if err == ERROR_PIPE_CONNECTED:
                # 客户端在 ConnectNamedPipe 调用前已连接
                pass
            else:
                logger.error(f"[PcmPipeServer] ConnectNamedPipe 失败: error={err}")
                return False

        self._client_connected = True
        logger.info(f"[PcmPipeServer] 客户端已连接: {self.pipe_name}")
        return True

    def cancel_wait(self):
        """取消阻塞的 wait_for_client()（从另一个线程调用安全）。

        通过关闭管道句柄使 ConnectNamedPipe 返回错误，从而解除阻塞。
        """
        handle = self._handle
        if handle is not None:
            self._handle = None
            self._client_connected = False
            _kernel32.CloseHandle(handle)
            logger.info(f"[PcmPipeServer] 已取消等待（句柄已关闭）: {self.pipe_name}")

    def write(self, data: bytes) -> bool:
        """写入数据到管道。返回 True 表示成功。"""
        if self._handle is None or not self._client_connected:
            return False

        bytes_written = wintypes.DWORD()
        result = _kernel32.WriteFile(
            self._handle,
            data,
            len(data),
            ctypes.byref(bytes_written),
            None,
        )
        if not result:
            err = ctypes.GetLastError()
            if err in (ERROR_NO_DATA, ERROR_BROKEN_PIPE):
                # 客户端已断开
                self._client_connected = False
                logger.info(f"[PcmPipeServer] 客户端已断开 (write): {self.pipe_name}")
                return False
            logger.warning(f"[PcmPipeServer] WriteFile 失败: error={err}")
            return False
        return True

    def disconnect_client(self):
        """主动断开当前客户端连接（管道可复用 wait_for_client 等待下一个）。"""
        if self._handle is not None:
            _kernel32.DisconnectNamedPipe(self._handle)
            self._client_connected = False
            logger.info(f"[PcmPipeServer] 客户端已断开: {self.pipe_name}")

    def close(self):
        """关闭管道句柄，释放资源。"""
        if self._handle is not None:
            if self._client_connected:
                _kernel32.DisconnectNamedPipe(self._handle)
            _kernel32.CloseHandle(self._handle)
            self._handle = None
            self._client_connected = False
            logger.info(f"[PcmPipeServer] 管道已关闭: {self.pipe_name}")

    @property
    def is_connected(self) -> bool:
        return self._client_connected

    def __del__(self):
        self.close()
