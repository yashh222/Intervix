"""Small SQLite backed cookie authentication for the local interview app."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from functools import wraps

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

auth = Blueprint("auth", __name__, url_prefix="/api/auth")
DB_PATH = Path(os.getenv("USER_DATABASE", Path(__file__).with_name("users.sqlite3")))


def _connect():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_auth_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _connect() as db:
        db.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL)")


def current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    with _connect() as db:
        row = db.execute("SELECT id, name, email FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def login_required(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        if not current_user():
            return jsonify(error="Authentication required"), 401
        return fn(*args, **kwargs)
    return wrapped


@auth.post("/signup")
def signup():
    data = request.get_json(silent=True) or {}
    name, email, password = (str(data.get(key, "")).strip() for key in ("name", "email", "password"))
    if not name or "@" not in email or len(password) < 8:
        return jsonify(error="Enter a name, valid email, and password of at least 8 characters."), 400
    try:
        with _connect() as db:
            cursor = db.execute("INSERT INTO users(name, email, password_hash) VALUES (?, ?, ?)", (name, email.lower(), generate_password_hash(password)))
            session["user_id"] = cursor.lastrowid
    except sqlite3.IntegrityError:
        return jsonify(error="An account with that email already exists."), 409
    return jsonify(user=current_user()), 201


@auth.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    with _connect() as db:
        row = db.execute("SELECT * FROM users WHERE email = ?", (str(data.get("email", "")).strip().lower(),)).fetchone()
    if not row or not check_password_hash(row["password_hash"], str(data.get("password", ""))):
        return jsonify(error="Email or password is incorrect."), 401
    session["user_id"] = row["id"]
    return jsonify(user=current_user())


@auth.post("/logout")
def logout():
    session.clear()
    return jsonify(success=True)


@auth.get("/me")
def me():
    user = current_user()
    return (jsonify(user=user), 200) if user else (jsonify(user=None), 200)
