"""Thread-safe pub/sub hub bridging worker threads to asyncio WebSocket clients."""
from __future__ import annotations

import asyncio
from collections import defaultdict


class Hub:
    def __init__(self) -> None:
        self.loop: asyncio.AbstractEventLoop | None = None
        self._subs: dict[str, set[asyncio.Queue]] = defaultdict(set)

    def bind(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop

    def subscribe(self, channel: str, maxsize: int = 30) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        self._subs[channel].add(q)
        return q

    def unsubscribe(self, channel: str, q: asyncio.Queue) -> None:
        self._subs[channel].discard(q)

    def has_subscribers(self, channel: str) -> bool:
        return bool(self._subs.get(channel))

    def subscriber_count(self) -> int:
        return sum(len(s) for s in self._subs.values())

    def _deliver(self, channel: str, msg: dict) -> None:
        for q in list(self._subs.get(channel, ())):
            if q.full():  # slow consumer: drop the oldest frame rather than block producers
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            q.put_nowait(msg)

    def publish(self, channel: str, msg: dict) -> None:
        if self.loop is None or not self._subs.get(channel):
            return
        try:
            self.loop.call_soon_threadsafe(self._deliver, channel, msg)
        except RuntimeError:  # loop closed during shutdown
            pass


hub = Hub()
