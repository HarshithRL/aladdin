from functools import wraps
from flask import session, redirect, url_for, request
import identity
import json
from custom_logger import logger
from utils.account_sql_utils import AccountSQLUtilities
import config.run_config as run_config

account_utils = AccountSQLUtilities()

def require_login(func):
    """Decorator to require login for specific routes."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not session.get("user_is_logged_in"):
            logger.info("User not logged in, redirecting to login.")
            return redirect(url_for('auth.login'))
        return func(*args, **kwargs)
    return wrapper

def get_auth_access_token():
    """SSO removed: return a placeholder token for any calls expecting it."""
    logger.info("Returning placeholder access token (SSO disabled)")
    return "fake_token"
