import asyncio
import websockets
import json
import logging
import sys
from datetime import datetime

import database
import crypto_utils
import paillier_service

# 配置日志
logging.basicConfig(
    level=logging. INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging. FileHandler('backend. log')
    ]
)
logger = logging.getLogger(__name__)

# 初始化数据库
database.init_db()

# 初始化加密管理器
crypto_manager = crypto_utils. CryptoManager()

# 初始化 Paillier 密钥（2048位）
logger.info("正在初始化 Paillier 密钥对...")
paillier_service. init_paillier_keys(2048)

# 启动密钥轮换（每5分钟）
paillier_service. start_key_rotation(key_size=2048, interval=5*60)
logger.info("Paillier 密钥系统初始化完成")

# 存储所有连接的客户端
connected_clients = set()

async def handler(websocket):
    client_addr = websocket.remote_address
    logger.info(f"新连接: {client_addr}")
    
    connected_clients.add(websocket)
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data. get('type')

                # === 安全聊天 ===
                
                if msg_type == 'HANDSHAKE_INIT':
                    client_pub = data.get('publicKey')
                    logger.info("收到握手请求...")
                    
                    server_pub = crypto_manager.get_public_key_b64(websocket)
                    
                    if crypto_manager.handle_handshake(websocket, client_pub):
                        await websocket.send(json.dumps({
                            'type': 'HANDSHAKE_REPLY',
                            'publicKey': server_pub
                        }))
                        logger.info("握手完成")
                    else:
                        await websocket.send(json.dumps({
                            'type': 'HANDSHAKE_ERROR',
                            'error': '密钥协商失败'
                        }))

                elif msg_type == 'CHAT_MESSAGE':
                    content_enc = data.get('content')
                    iv = data.get('iv')
                    
                    try:
                        plaintext = crypto_manager.decrypt_message(websocket, iv, content_enc)
                        logger.info(f"收到密文，解密内容: {plaintext}")
                        
                        database.save_message("Alice", content_enc, iv)
                        
                        reply_text = f"Server收到: {plaintext} (From Python)"
                        encrypted_reply = crypto_manager.encrypt_reply(websocket, reply_text)
                        
                        await websocket.send(json. dumps({
                            'type': 'CHAT_REPLY',
                            'sender': 'Bob (Server)',
                            'content': encrypted_reply['content'],
                            'iv': encrypted_reply['iv']
                        }))
                    except Exception as e:
                        logger. error(f"解密或回复失败: {e}")

                # === 隐私计算 ===
                
                elif msg_type == 'GET_SERVER_TIME':
                    now = datetime.now()
                    await websocket.send(json.dumps({
                        'type': 'SERVER_TIME',
                        'time': now.strftime('%Y-%m-%d %H:%M:%S'),
                        'timestamp': now.timestamp()
                    }))

                elif msg_type == 'GET_PAILLIER_KEY':
                    logger.info("前端请求 Paillier 公钥")
                    key_data = paillier_service. get_public_key_with_info()
                    
                    await websocket.send(json. dumps({
                        'type': 'PAILLIER_KEY',
                        **key_data
                    }))
                    logger.info("已发送 Paillier 公钥")

                elif msg_type == 'GET_KEY_STATUS':
                    key_info = paillier_service.get_key_info()
                    
                    await websocket.send(json. dumps({
                        'type': 'KEY_STATUS',
                        'key_info': key_info
                    }))

                elif msg_type == 'ENCRYPT_VALUE':
                    value = data.get('value')
                    logger.info(f"收到加密请求: {value}")
                    
                    ciphertext = paillier_service.encrypt_value(int(value))
                    
                    await websocket.send(json.dumps({
                        'type': 'ENCRYPTED_VALUE',
                        'ciphertext': ciphertext,
                        'original': str(value)
                    }))

                elif msg_type == 'DECRYPT_VALUE':
                    ciphertext = data.get('ciphertext')
                    logger.info("收到解密请求")
                    
                    try:
                        plaintext = paillier_service.decrypt_value(ciphertext)
                        await websocket.send(json.dumps({
                            'type': 'DECRYPTED_VALUE',
                            'plaintext': plaintext
                        }))
                    except Exception as e:
                        await websocket.send(json.dumps({
                            'type': 'DECRYPT_ERROR',
                            'error': str(e)
                        }))

                elif msg_type == 'COMPUTE_SUM':
                    logger.info("收到同态计算请求")
                    pub_key = data.get('pub_key')
                    values = data.get('values')
                    
                    result_cipher = paillier_service.compute_homomorphic_sum(
                        pub_key['n'], 
                        pub_key['g'], 
                        values
                    )
                    
                    logger.info("计算完成")
                    
                    await websocket.send(json.dumps({
                        'type': 'COMPUTE_RESULT',
                        'result': result_cipher
                    }))

                elif msg_type == 'COMPUTE_SUM_SERVER_KEY':
                    logger.info("收到同态计算请求（服务端密钥）")
                    ciphertexts = data.get('values')
                    return_plaintext = data.get('return_plaintext', True)
                    
                    result = paillier_service.compute_with_server_key(
                        ciphertexts, 
                        return_plaintext=return_plaintext
                    )
                    
                    if result:
                        logger.info("计算完成")
                        await websocket.send(json. dumps({
                            'type': 'COMPUTE_RESULT_SERVER_KEY',
                            **result
                        }))
                    else:
                        await websocket.send(json.dumps({
                            'type': 'COMPUTE_ERROR',
                            'error': '计算失败'
                        }))

            except json.JSONDecodeError:
                logger.error("接收到非 JSON 数据")
            except Exception as e:
                logger.error(f"处理消息时发生未知错误: {e}")
                import traceback
                traceback.print_exc()

    except websockets.exceptions.ConnectionClosed:
        logger.info(f"连接断开: {client_addr}")
    finally:
        connected_clients.discard(websocket)
        crypto_manager.remove_client(websocket)

async def main():
    logger.info("=== AliceCrypto 后端服务启动 ===")
    logger.info("监听端口: 8080 (0.0.0. 0)")
    
    try:
        async with websockets.serve(handler, "0. 0.0.0", 8080):
            await asyncio.Future()
    except Exception as e:
        logger.critical(f"服务器启动失败: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("服务器手动停止")
