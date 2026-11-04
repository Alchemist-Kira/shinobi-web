from abc import ABC, abstractmethod

class BaseSource(ABC):
    @property
    @abstractmethod
    def id(self) -> str:
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    @abstractmethod
    def version(self) -> str:
        pass

    @property
    @abstractmethod
    def icon_url(self) -> str:
        pass

    @property
    def supports_latest(self) -> bool:
        return True

    @abstractmethod
    def search(self, query: str = "", page: int = 1, limit: int = 24, **kwargs) -> dict:
        pass

    @abstractmethod
    def get_popular(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        pass

    def get_latest(self, page: int = 1, limit: int = 24, **kwargs) -> dict:
        return self.get_popular(page=page, limit=limit, order="latest", sort="latest", **kwargs)

    def get_filters(self) -> list:
        return []

    @abstractmethod
    def get_details(self, manga_id: str) -> dict:
        pass

    @abstractmethod
    def get_chapters(self, manga_id: str, limit: int = 100, offset: int = 0) -> list:
        pass

    @abstractmethod
    def get_chapter_pages(self, chapter_id: str) -> list:
        pass
