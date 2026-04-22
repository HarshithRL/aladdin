from flask import Blueprint

docbuild_bp = Blueprint('docint', __name__)

from . import routes