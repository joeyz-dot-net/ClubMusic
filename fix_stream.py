#!/usr/bin/env python3
"""替换并行广播为同步串行广播"""
import re

filepath = r'c:\Users\hnzzy\OneDrive\Desktop\MusicPlayer\models\stream.py'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 要替换的旧代码片段（从"并行分发"到"处理结果失败"）
old_pattern = r'''                # .* 并行分发到所有客户端.*
                futures = \[\]
                for client_id, client_info in clients_snapshot:
                    future = BROADCAST_EXECUTOR\.submit\(
                        send_to_client,
                        client_id, client_info, seq_id, chunk
                    \)
                    futures\.append\(\(future, client_id, client_info\)\)
                
                # 等待所有任务完成，最多50ms总超时
                done, pending = concurrent\.futures\.wait\(
                    \[f for f, _, _ in futures\],
                    timeout=0\.05,  # 50ms总超时（远小于串行的120ms）
                    return_when=concurrent\.futures\.ALL_COMPLETED
                \)
                
                # 取消超时的任务
                for future in pending:
                    future\.cancel\(\)
                
                # 统计结果并更新客户端统计
                success_count = 0
                fail_count = 0
                
                for future, client_id, client_info in futures:
                    try:
                        if future in done:
                            if future\.result\(\):
                                success_count \+= 1
                                failed_clients\.discard\(client_id\)
                                # 更新统计
                                client_info\.bytes_sent \+= len\(chunk\)
                                client_info\.chunks_received \+= 1
                                CLIENT_POOL\.stats\["total_bytes_sent"\] \+= len\(chunk\)
                                CLIENT_POOL\.stats\["total_chunks_sent"\] \+= 1
                            else:
                                fail_count \+= 1
                                failed_clients\.add\(client_id\)
                        else:
                            # 超时的任务
                            fail_count \+= 1
                            failed_clients\.add\(client_id\)
                    except Exception as e:
                        logger\.error\(f"处理结果失败 \{client_id\[:8\]\}: \{e\}"\)
                        fail_count \+= 1
                        failed_clients\.add\(client_id\)'''

new_code = '''                # 🔥 同步串行广播 - 确保每个块都发送成功
                # 并行广播的50ms超时会导致数据丢失，造成声音加速和断裂
                success_count = 0
                fail_count = 0
                
                for client_id, client_info in clients_snapshot:
                    try:
                        result = send_to_client(client_id, client_info, seq_id, chunk)
                        if result:
                            success_count += 1
                            failed_clients.discard(client_id)
                            # 更新统计
                            client_info.bytes_sent += len(chunk)
                            client_info.chunks_received += 1
                            CLIENT_POOL.stats["total_bytes_sent"] += len(chunk)
                            CLIENT_POOL.stats["total_chunks_sent"] += 1
                        else:
                            fail_count += 1
                            failed_clients.add(client_id)
                    except Exception as e:
                        logger.error(f"发送失败 {client_id[:8]}: {e}")
                        fail_count += 1
                        failed_clients.add(client_id)'''

new_content = re.sub(old_pattern, new_code, content, flags=re.DOTALL)

if new_content != content:
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('✅ 修改成功！已将并行广播替换为同步串行广播')
else:
    print('❌ 未找到匹配内容，尝试手动查找...')
    # 查找关键行
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if '并行分发' in line or 'BROADCAST_EXECUTOR' in line:
            print(f"Line {i+1}: {line}")
