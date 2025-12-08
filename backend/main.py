import asyncio
import json
import logging
import os
import secrets
import sys
from datetime import datetime
from typing import Any, Dict, Set

import websockets
from websockets.server import WebSocketServerProtocol

from fhe_service import FHEManager
from database import (
    init_db, register_user, login_user, verify_token, 
    logout_user, get_user_by_id
)

# HTTP 服务器支持 (用于 REST API)
try:
    from aiohttp import web
    HAS_AIOHTTP = True
except ImportError:
    HAS_AIOHTTP = False


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("backend.log"),
    ],
)
logger = logging.getLogger(__name__)


# 初始化数据库
init_db()

fhe_manager = FHEManager(rotation_interval=5 * 60)


connected_clients: Set[WebSocketServerProtocol] = set()
mpc_sessions: Dict[WebSocketServerProtocol, Dict[str, Any]] = {}


def build_server_time() -> Dict[str, Any]:
    """返回统一的服务器时间戳信息。"""
    now = datetime.utcnow()
    return {
        "time": now.strftime("%Y-%m-%d %H:%M:%S"),
        "timestamp": now.timestamp(),
        "iso_time": now.isoformat(timespec="seconds"),
    }


async def broadcast(message: Dict[str, Any]) -> None:
    """向所有已连接客户端广播消息。"""
    if not connected_clients:
        return

    payload = json.dumps(message)
    tasks = []
    for client in list(connected_clients):
        if client.closed:
            connected_clients.discard(client)
            continue
        tasks.append(client.send(payload))

    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


async def handler(websocket: WebSocketServerProtocol) -> None:
    client_addr = websocket.remote_address
    logger.info("新连接: %s", client_addr)

    connected_clients.add(websocket)

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                msg_type = data.get("type")

                if msg_type == "GET_FHE_KEY":
                    algorithm = data.get("algorithm", "PAILLIER")
                    try:
                        bundle = fhe_manager.get_key_bundle(algorithm)
                        await websocket.send(
                            json.dumps(
                                {
                                    "type": "FHE_KEY",
                                    **bundle,
                                }
                            )
                        )
                        logger.info("已发送 %s 公钥", bundle["algorithm"])
                    except ValueError as exc:
                        await websocket.send(
                            json.dumps({"type": "FHE_ERROR", "error": str(exc)})
                        )

                elif msg_type == "GET_ALL_FHE_KEYS":
                    await websocket.send(
                        json.dumps(
                            {
                                "type": "FHE_KEYS",
                                "keys": fhe_manager.get_all_key_bundles(),
                            }
                        )
                    )

                elif msg_type == "BATCH_ENCRYPT":
                    await websocket.send(
                        json.dumps(
                            {
                                "type": "FHE_ERROR",
                                "error": "明文加密已禁用，请在前端使用公钥加密后仅上传密文",
                            }
                        )
                    )
                    logger.warning("拒绝明文加密请求 (BATCH_ENCRYPT)")

                elif msg_type == "COMPUTE_FHE":
                    algorithm = data.get("algorithm", "PAILLIER")
                    ciphertexts = data.get("ciphertexts") or []
                    try:
                        result = fhe_manager.compute(algorithm, ciphertexts)
                        await websocket.send(
                            json.dumps(
                                {
                                    "type": "COMPUTE_RESULT",
                                    "algorithm": algorithm,
                                    **result,
                                }
                            )
                        )
                        logger.info("完成 %s 同态计算", algorithm)
                    except Exception as exc:  # noqa: BLE001
                        await websocket.send(
                            json.dumps({"type": "FHE_ERROR", "error": str(exc)})
                        )

                elif msg_type == "GET_SERVER_TIME":
                    payload = {
                        "type": "SERVER_TIME",
                        **build_server_time(),
                        "keys": fhe_manager.get_all_key_bundles(),
                    }
                    await websocket.send(json.dumps(payload))

                elif msg_type == "GET_KEY_STATUS":
                    algorithm = data.get("algorithm")
                    if algorithm:
                        try:
                            info = fhe_manager.get_key_bundle(algorithm)
                            payload = {
                                "type": "KEY_STATUS",
                                "algorithm": algorithm,
                                "key_info": info["key_info"],
                            }
                        except ValueError as exc:
                            payload = {"type": "FHE_ERROR", "error": str(exc)}
                    else:
                        payload = {
                            "type": "KEY_STATUS",
                            "keys": fhe_manager.get_all_key_bundles(),
                        }
                    await websocket.send(json.dumps(payload))

                elif msg_type == "MPC_GENERATE_SECRET":
                    secret = secrets.randbelow(9_000_000) + 1_000_000
                    mpc_sessions[websocket] = {
                        "secret": secret,
                        "generated_at": datetime.utcnow().isoformat(),
                    }
                    logger.info("为 %s 生成 MPC 密钥", client_addr)

                    await websocket.send(
                        json.dumps(
                            {
                                "type": "MPC_SECRET_GENERATED",
                                "timestamp": datetime.utcnow().isoformat(),
                            }
                        )
                    )

                elif msg_type == "MPC_COMPARE_INIT":
                    try:
                        alice_value = int(data.get("value"))
                    except (TypeError, ValueError):
                        await websocket.send(
                            json.dumps(
                                {
                                    "type": "MPC_ERROR",
                                    "error": "无效的输入值",
                                }
                            )
                        )
                        continue

                    session = mpc_sessions.get(websocket)
                    if not session:
                        await websocket.send(
                            json.dumps(
                                {
                                    "type": "MPC_ERROR",
                                    "error": "服务器尚未生成 Bob 的秘密，请先生成",
                                }
                            )
                        )
                        continue

                    bob_secret = session["secret"]

                    if alice_value > bob_secret:
                        compare_result = "Alice is Richer"
                    elif alice_value < bob_secret:
                        compare_result = "Bob is Richer"
                    else:
                        compare_result = "Equal Wealth"

                    await websocket.send(
                        json.dumps(
                            {
                                "type": "MPC_COMPARE_RESULT",
                                "result": compare_result,
                            }
                        )
                    )
                    logger.info(
                        "完成百万富翁协议: Alice=%s, Bob=%s, 结果=%s",
                        alice_value,
                        bob_secret,
                        compare_result,
                    )

                else:
                    await websocket.send(
                        json.dumps(
                            {
                                "type": "UNKNOWN_TYPE",
                                "error": f"不支持的消息类型: {msg_type}",
                            }
                        )
                    )

            except json.JSONDecodeError:
                logger.error("接收到非 JSON 数据")
            except Exception as exc:  # noqa: BLE001
                logger.exception("处理消息时发生未知错误: %s", exc)

    except websockets.exceptions.ConnectionClosed:
        logger.info("连接断开: %s", client_addr)
    finally:
        connected_clients.discard(websocket)
        mpc_sessions.pop(websocket, None)


async def main() -> None:
    logger.info("=== AliceCrypto 后端服务启动 ===")
    logger.info("正在初始化多算法 FHE 引擎...")

    loop = asyncio.get_running_loop()

    def on_key_rotation() -> None:
        payload = {
            "type": "KEY_ROTATED",
            **build_server_time(),
            "keys": fhe_manager.get_all_key_bundles(),
        }
        logger.info("已轮换 FHE 密钥，通知 %d 个客户端", len(connected_clients))
        asyncio.run_coroutine_threadsafe(broadcast(payload), loop)

    fhe_manager.start_auto_rotation(on_rotate=on_key_rotation)
    logger.info("密钥轮换线程已启动，周期 5 分钟")
    logger.info("监听端口: 8080 (0.0.0.0)")

    try:
        async with websockets.serve(handler, "0.0.0.0", 8080):
            await asyncio.Future()
    except Exception as exc:  # noqa: BLE001
        logger.critical("服务器启动失败: %s", exc)


# ============== REST API 处理函数 (仅当 aiohttp 可用时) ==============

if HAS_AIOHTTP:
    async def health_check(request: web.Request) -> web.Response:
        """健康检查端点"""
        return web.json_response({
            'status': 'healthy',
            'service': 'AliceCrypto Backend',
            'version': '2.2',
            'timestamp': datetime.utcnow().isoformat()
        })

    async def register_endpoint(request: web.Request) -> web.Response:
        """用户注册端点"""
        try:
            data = await request.json()
        except Exception:
            return web.json_response(
                {'error': '无效的 JSON 数据'},
                status=400
            )

        username = data.get('username', '').strip()
        password = data.get('password', '').strip()
        email = data.get('email', '').strip() if data.get('email') else None

        if not username or not password:
            return web.json_response(
                {'error': '用户名和密码为必填项'},
                status=400
            )

        if len(password) < 6:
            return web.json_response(
                {'error': '密码长度至少 6 位'},
                status=400
            )

        result = register_user(username, password, email)

        if result['success']:
            return web.json_response(
                {
                    'message': result['message'],
                    'user': result['user']
                },
                status=201
            )
        else:
            return web.json_response(
                {'error': result['message']},
                status=409
            )

    async def login_endpoint(request: web.Request) -> web.Response:
        """用户登录端点"""
        try:
            data = await request.json()
        except Exception:
            return web.json_response(
                {'error': '无效的 JSON 数据'},
                status=400
            )

        username = data.get('username', '').strip()
        password = data.get('password', '').strip()

        if not username or not password:
            return web.json_response(
                {'error': '用户名和密码为必填项'},
                status=400
            )

        # 获取客户端 IP
        ip_address = request.remote

        result = login_user(username, password, ip_address)

        if result['success']:
            return web.json_response(
                {
                    'message': result['message'],
                    'token': result['token'],
                    'user': result['user']
                },
                status=200
            )
        else:
            return web.json_response(
                {'error': result['message']},
                status=401
            )

    async def logout_endpoint(request: web.Request) -> web.Response:
        """用户登出端点"""
        token = request.headers.get('Authorization', '').replace('Bearer ', '')

        if not token:
            return web.json_response(
                {'error': '缺少认证令牌'},
                status=401
            )

        user = verify_token(token)
        if not user:
            return web.json_response(
                {'error': '无效的令牌'},
                status=401
            )

        logout_user(token)
        return web.json_response(
            {'message': '登出成功'},
            status=200
        )

    async def profile_endpoint(request: web.Request) -> web.Response:
        """获取用户个人信息"""
        token = request.headers.get('Authorization', '').replace('Bearer ', '')

        if not token:
            return web.json_response(
                {'error': '缺少认证令牌'},
                status=401
            )

        user = verify_token(token)
        if not user:
            return web.json_response(
                {'error': '无效或过期的令牌'},
                status=401
            )

        return web.json_response(
            {
                'message': '获取成功',
                'user': user
            },
            status=200
        )

    async def start_http_server() -> web.AppRunner:
        """启动 HTTP 服务器用于 REST API"""
        # 添加一个简单的 CORS 中间件，处理浏览器的 preflight OPTIONS 请求
        @web.middleware
        async def cors_middleware(request, handler):
            # 如果是预检请求，直接返回 200
            if request.method == 'OPTIONS':
                resp = web.Response(status=200)
            else:
                resp = await handler(request)

            request_origin = request.headers.get('Origin')
            allowed_origins = [
                origin.strip()
                for origin in os.getenv('ALLOWED_ORIGINS', '').split(',')
                if origin.strip()
            ]

            if allowed_origins:
                allow_origin = request_origin if request_origin in allowed_origins else allowed_origins[0]
            else:
                # 默认允许当前请求来源；若无 Origin 则回退为 *
                allow_origin = request_origin or '*'

            resp.headers['Access-Control-Allow-Origin'] = allow_origin
            resp.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
            resp.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
            resp.headers['Access-Control-Allow-Credentials'] = 'true'
            resp.headers['Vary'] = 'Origin'
            return resp

        app = web.Application(middlewares=[cors_middleware])
        app.router.add_post('/api/auth/register', register_endpoint)
        app.router.add_post('/api/auth/login', login_endpoint)
        app.router.add_post('/api/auth/logout', logout_endpoint)
        app.router.add_get('/api/auth/profile', profile_endpoint)
        app.router.add_get('/api/health', health_check)

        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, '0.0.0.0', 8081)
        await site.start()
        logger.info("HTTP API 服务器启动在端口 8081")
        return runner

    async def main_with_http() -> None:
        """同时运行 WebSocket 和 HTTP 服务器"""
        logger.info("=== AliceCrypto 后端服务启动（含 REST API）===")
        logger.info("正在初始化多算法 FHE 引擎...")

        loop = asyncio.get_running_loop()

        def on_key_rotation() -> None:
            payload = {
                "type": "KEY_ROTATED",
                **build_server_time(),
                "keys": fhe_manager.get_all_key_bundles(),
            }
            logger.info("已轮换 FHE 密钥，通知 %d 个客户端", len(connected_clients))
            asyncio.run_coroutine_threadsafe(broadcast(payload), loop)

        fhe_manager.start_auto_rotation(on_rotate=on_key_rotation)
        logger.info("密钥轮换线程已启动，周期 5 分钟")
        logger.info("WebSocket 监听端口: 8080 (0.0.0.0)")

        try:
            # 启动 HTTP 服务器
            http_runner = await start_http_server()

            # 启动 WebSocket 服务器
            async with websockets.serve(handler, "0.0.0.0", 8080):
                await asyncio.Future()
        except Exception as exc:  # noqa: BLE001
            logger.critical("服务器启动失败: %s", exc)
        finally:
            if 'http_runner' in locals():
                await http_runner.cleanup()


if __name__ == "__main__":
    try:
        if HAS_AIOHTTP:
            asyncio.run(main_with_http())
        else:
            logger.warning("aiohttp 未安装，仅启动 WebSocket 服务。请运行: pip install aiohttp")
            asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("服务器手动停止")
