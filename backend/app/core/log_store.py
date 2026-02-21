import asyncio
from collections import defaultdict
from typing import AsyncGenerator

# In-memory log store: project_id -> list of log messages
_logs: dict[str, list[str]] = defaultdict(list)
_listeners: dict[str, list[asyncio.Queue]] = defaultdict(list)


def append_log(project_id: str, message: str):
    """Add a log message for a project."""
    _logs[project_id].append(message)
    for queue in _listeners[project_id]:
        queue.put_nowait(message)


def get_logs(project_id: str) -> list[str]:
    return _logs.get(project_id, [])


async def subscribe(project_id: str) -> AsyncGenerator[str, None]:
    """Stream log messages for a project as SSE."""
    queue: asyncio.Queue = asyncio.Queue()
    _listeners[project_id].append(queue)
    
    # Send existing logs first
    for log in _logs.get(project_id, []):
        yield f"data: {log}\n\n"
    
    try:
        while True:
            try:
                message = await asyncio.wait_for(queue.get(), timeout=30.0)
                yield f"data: {message}\n\n"
                if message == "DONE" or message == "FAILED":
                    break
            except asyncio.TimeoutError:
                yield f"data: ping\n\n"  # keep connection alive
    finally:
        _listeners[project_id].remove(queue)