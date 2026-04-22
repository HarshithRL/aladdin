from flask import Blueprint

sidebar_bp = Blueprint('sidebar', __name__)

from . import api
