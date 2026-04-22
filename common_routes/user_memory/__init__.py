from flask import Blueprint

user_memory_bp = Blueprint('user_memory', __name__)

from . import routes
