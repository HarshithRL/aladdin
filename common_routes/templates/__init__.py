from flask import Blueprint

templates_bp = Blueprint('templates', __name__)

from . import api
