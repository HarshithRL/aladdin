from flask import Blueprint

chat_bp = Blueprint('relaychat', __name__)

from . import routes