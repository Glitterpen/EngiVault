from __future__ import annotations

import httpx


class OpenAIEmbedder:
    def __init__(self, api_key: str, model: str = "text-embedding-3-small", dimensions: int = 1536) -> None:
        self.model=model; self.dimensions=dimensions
        self.client=httpx.Client(base_url="https://api.openai.com",headers={"authorization":f"Bearer {api_key}"},timeout=60.0)
    def close(self) -> None: self.client.close()
    def embed(self, texts:list[str]) -> list[list[float]]:
        if not texts:return []
        vectors:list[list[float]]=[]
        for start in range(0,len(texts),100):
            batch=[text[:12000] or " " for text in texts[start:start+100]]
            response=self.client.post("/v1/embeddings",json={"model":self.model,"input":batch,"dimensions":self.dimensions})
            response.raise_for_status(); data=sorted(response.json()["data"],key=lambda item:item["index"])
            vectors.extend(item["embedding"] for item in data)
        return vectors
