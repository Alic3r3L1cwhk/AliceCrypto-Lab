import asyncio
import websockets
import json
import logging
import sys

import database
import crypto_utils
import paillier_service

logging.basicConfig(
    level=logging. INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging. FileHandler('backend.log')
    ]
)
logger = logging.getLogger(__name__)

database. init_db()
crypto_manager = crypto_utils. CryptoManager()

async def handler(websocket):
    client_addr = websocket.remote_address
    logger.info(f"新连接: {client_addr}")
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data. get('type')

                if msg_type == 'HANDSHAKE_INIT':
                    client_pub = data.get('publicKey')
                    logger.info("收到握手请求...")
                    
                    # 先获取服务端公钥（这会为该连接生成密钥对）
                    server_pub = crypto_manager. get_public_key_b64(websocket)
                    
                    # 然后处理握手
                    if crypto_manager.handle_handshake(websocket, client_pub):
                        await websocket.send(json.dumps({
                            'type': 'HANDSHAKE_REPLY',
                            'publicKey': server_pub
                        }))
                        logger.info("握手完成，已发送服务端公钥")
                    else:
                        await websocket.send(json. dumps({
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

                elif msg_type == 'COMPUTE_SUM':
                    logger.info("收到同态计算请求")
                    pub_key = data. get('pub_key')
                    values = data.get('values')
                    
                    result_cipher = paillier_service. compute_homomorphic_sum(
                        pub_key['n'], 
                        pub_key['g'], 
                        values
                    )
                    
                    logger.info(f"计算完成，结果密文: {result_cipher}")
                    
                    await websocket.send(json.dumps({
                        'type': 'COMPUTE_RESULT',
                        'result': result_cipher
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
