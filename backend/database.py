import sqlite3
import datetime
import os

DB_NAME = 'crypto_lab.db'

def init_db():
    """初始化数据库表结构"""
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    # 创建消息表
    c.execute('''CREATE TABLE IF NOT EXISTS messages
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  sender TEXT, 
                  content_encrypted TEXT, 
                  iv TEXT, 
                  timestamp DATETIME)''')
    conn.commit()
    conn.close()
    print(f"[Database] 数据库 {DB_NAME} 初始化完成")

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
