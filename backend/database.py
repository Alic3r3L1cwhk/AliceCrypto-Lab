import sqlite3
import datetime
import os
import hashlib
import secrets
import json
from typing import Optional, Dict, Any, Tuple

DB_NAME = 'crypto_lab.db'

def hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """
    对密码进行哈希处理
    返回 (hashed_password, salt)
    """
    if salt is None:
        salt = secrets.token_hex(16)
    
    hashed = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    )
    return hashed.hex(), salt

def verify_password(password: str, hashed: str, salt: str) -> bool:
    """验证密码是否正确"""
    computed_hash, _ = hash_password(password, salt)
    return computed_hash == hashed

def generate_token() -> str:
    """生成用户认证令牌"""
    return secrets.token_urlsafe(32)

def init_db():
    """初始化数据库表结构"""
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    
    # 创建用户表
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE NOT NULL,
                  email TEXT,
                  password_hash TEXT NOT NULL,
                  password_salt TEXT NOT NULL,
                  token TEXT UNIQUE,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  is_active BOOLEAN DEFAULT 1)''')
    
    # 创建消息表（向后兼容）
    c.execute('''CREATE TABLE IF NOT EXISTS messages
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  sender TEXT, 
                  content_encrypted TEXT, 
                  iv TEXT, 
                  timestamp DATETIME)''')
    
    # 创建用户会话表
    c.execute('''CREATE TABLE IF NOT EXISTS user_sessions
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER NOT NULL,
                  token TEXT UNIQUE NOT NULL,
                  login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
                  ip_address TEXT,
                  FOREIGN KEY (user_id) REFERENCES users(id))''')
    
    conn.commit()
    conn.close()
    print(f"[Database] 数据库 {DB_NAME} 初始化完成")

# ============== 用户认证功能 ==============

def register_user(username: str, password: str, email: Optional[str] = None) -> Dict[str, Any]:
    """
    注册新用户
    返回 {'success': bool, 'message': str, 'user': user_info}
    """
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        
        # 检查用户是否已存在
        c.execute("SELECT id FROM users WHERE username = ?", (username,))
        if c.fetchone():
            return {
                'success': False,
                'message': f'用户名 {username} 已存在'
            }
        
        # 生成密码哈希
        password_hash, password_salt = hash_password(password)
        token = generate_token()
        
        # 插入新用户
        c.execute('''INSERT INTO users 
                     (username, email, password_hash, password_salt, token, is_active)
                     VALUES (?, ?, ?, ?, ?, 1)''',
                  (username, email, password_hash, password_salt, token))
        
        conn.commit()
        user_id = c.lastrowid
        conn.close()
        
        print(f"[Database] 新用户注册成功: {username}")
        
        return {
            'success': True,
            'message': '注册成功',
            'user': {
                'id': user_id,
                'username': username,
                'email': email,
                'created_at': datetime.datetime.now().isoformat()
            }
        }
    except Exception as e:
        print(f"[Database] 注册失败: {e}")
        return {
            'success': False,
            'message': f'注册失败: {str(e)}'
        }

def login_user(username: str, password: str, ip_address: Optional[str] = None) -> Dict[str, Any]:
    """
    用户登录
    返回 {'success': bool, 'message': str, 'token': str, 'user': user_info}
    """
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        
        # 查询用户
        c.execute('''SELECT id, password_hash, password_salt, username, email, is_active 
                     FROM users WHERE username = ?''', (username,))
        user = c.fetchone()
        
        if not user:
            return {
                'success': False,
                'message': '用户名或密码错误'
            }
        
        user_id, password_hash, password_salt, db_username, email, is_active = user
        
        if not is_active:
            return {
                'success': False,
                'message': '账号已被禁用'
            }
        
        # 验证密码
        if not verify_password(password, password_hash, password_salt):
            return {
                'success': False,
                'message': '用户名或密码错误'
            }
        
        # 生成新令牌
        token = generate_token()
        
        # 更新用户令牌
        c.execute("UPDATE users SET token = ? WHERE id = ?", (token, user_id))
        
        # 记录会话
        c.execute('''INSERT INTO user_sessions 
                     (user_id, token, ip_address)
                     VALUES (?, ?, ?)''',
                  (user_id, token, ip_address))
        
        conn.commit()
        conn.close()
        
        print(f"[Database] 用户登录成功: {username}")
        
        return {
            'success': True,
            'message': '登录成功',
            'token': token,
            'user': {
                'id': user_id,
                'username': db_username,
                'email': email
            }
        }
    except Exception as e:
        print(f"[Database] 登录失败: {e}")
        return {
            'success': False,
            'message': f'登录失败: {str(e)}'
        }

def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """
    验证令牌并返回用户信息
    返回 user_info 或 None
    """
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        
        c.execute('''SELECT u.id, u.username, u.email, u.is_active
                     FROM users u
                     WHERE u.token = ? AND u.is_active = 1''', (token,))
        user = c.fetchone()
        conn.close()
        
        if user:
            user_id, username, email, is_active = user
            return {
                'id': user_id,
                'username': username,
                'email': email
            }
        return None
    except Exception as e:
        print(f"[Database] 令牌验证失败: {e}")
        return None

def logout_user(token: str) -> bool:
    """用户登出，清除令牌"""
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("UPDATE users SET token = NULL WHERE token = ?", (token,))
        conn.commit()
        conn.close()
        print(f"[Database] 用户登出成功")
        return True
    except Exception as e:
        print(f"[Database] 登出失败: {e}")
        return False

def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """根据 ID 获取用户信息"""
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute('''SELECT id, username, email, created_at, is_active
                     FROM users WHERE id = ?''', (user_id,))
        user = c.fetchone()
        conn.close()
        
        if user:
            user_id, username, email, created_at, is_active = user
            return {
                'id': user_id,
                'username': username,
                'email': email,
                'created_at': created_at,
                'is_active': is_active
            }
        return None
    except Exception as e:
        print(f"[Database] 获取用户信息失败: {e}")
        return None

# ============== 消息存储功能（向后兼容） ==============

def save_message(sender, content_encrypted, iv):
    """保存一条加密消息"""
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("INSERT INTO messages (sender, content_encrypted, iv, timestamp) VALUES (?, ?, ?, ?)",
                  (sender, content_encrypted, iv, datetime.datetime.now()))
        conn.commit()
        conn.close()
        print(f"[Database] 已存储来自 {sender} 的消息")
    except Exception as e:
        print(f"[Database] 存储失败: {e}")
