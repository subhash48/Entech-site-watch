"""Consistent JSON error responses: {"error": {"code", "message", "details"}}."""
import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("sitewatch")


class APIError(Exception):
    """An expected client error with a stable machine-readable code."""

    def __init__(self, status_code: int, code: str, message: str, details: Any = None):
        super().__init__(message)
        self.status_code, self.code, self.message, self.details = status_code, code, message, details


class DataLoadError(Exception):
    """The source data files are missing or unreadable, so the service cannot answer."""


def error_body(code: str, message: str, details: Any = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details}}


HTTP_CODES = {404: "NOT_FOUND", 405: "METHOD_NOT_ALLOWED"}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIError)
    async def _api_error(_: Request, exc: APIError):
        return JSONResponse(error_body(exc.code, exc.message, exc.details), status_code=exc.status_code)

    @app.exception_handler(DataLoadError)
    async def _data_error(_: Request, exc: DataLoadError):
        log.error("Data unavailable: %s", exc)
        return JSONResponse(error_body("DATA_UNAVAILABLE", str(exc)), status_code=503)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        details = [{"field": ".".join(str(p) for p in err["loc"][1:]) or str(err["loc"][0]),
                    "message": err["msg"]} for err in exc.errors()]
        return JSONResponse(error_body("VALIDATION_ERROR", "One or more request parameters are invalid.", details),
                            status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException):
        code = HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
        return JSONResponse(error_body(code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def _unexpected(_: Request, exc: Exception):
        log.exception("Unhandled error")
        return JSONResponse(error_body("INTERNAL_ERROR", "An unexpected error occurred."), status_code=500)
