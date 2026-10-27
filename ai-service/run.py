import os

import uvicorn


host = os.environ.get("AI_BIND_HOST", "127.0.0.1")
if host == "0.0.0.0" and os.environ.get("AI_ALLOW_PUBLIC_BIND") != "true":
    raise RuntimeError("AI_BIND_HOST=0.0.0.0 requires explicit AI_ALLOW_PUBLIC_BIND=true")

uvicorn.run(
    "app:app",
    host=host,
    port=int(os.environ.get("AI_PORT", "8000")),
    app_dir=os.path.dirname(__file__),
)
