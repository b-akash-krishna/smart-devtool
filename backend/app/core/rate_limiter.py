import time
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

async def check_rate_limit(ip: str, limit: int = 10, window_seconds: int = 3600) -> tuple[bool, int]:
    """
    Returns (allowed, retry_after_seconds).
    Uses Redis sliding window counter.
    """
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        
        key = f"rate_limit:{ip}"
        now = int(time.time())
        window_start = now - window_seconds
        
        pipe = r.pipeline()
        # Remove old requests outside the window
        pipe.zremrangebyscore(key, 0, window_start)
        # Count requests in current window
        pipe.zcard(key)
        # Add current request
        pipe.zadd(key, {str(now): now})
        # Set expiry
        pipe.expire(key, window_seconds)
        results = await pipe.execute()
        await r.aclose()
        
        count = results[1]  # count before adding current
        
        if count >= limit:
            # Find oldest request to calculate retry_after
            retry_after = window_seconds
            return False, retry_after
        
        return True, 0

    except Exception as e:
        logger.warning(f"Rate limiter error (allowing request): {e}")
        # Fail open — if Redis is down, allow the request
        return True, 0