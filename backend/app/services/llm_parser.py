import json
import logging
from dataclasses import dataclass, field

import asyncio

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.schema import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.core.config import settings

logger = logging.getLogger(__name__)


# --- Pydantic models for structured output ---

class Parameter(BaseModel):
    name: str
    location: str = Field(description="query, path, header, or body")
    type: str = Field(description="string, integer, boolean, object, array")
    required: bool = False
    description: str = ""


class Endpoint(BaseModel):
    path: str = Field(description="e.g. /users/{id}")
    method: str = Field(description="GET, POST, PUT, DELETE, PATCH")
    summary: str = ""
    description: str = ""
    parameters: list[Parameter] = []
    request_body: dict = {}
    response_schema: dict = {}
    tags: list[str] = []


class AuthScheme(BaseModel):
    type: str = Field(description="bearer, api_key, oauth2, basic, or none")
    header_name: str = ""
    description: str = ""


class APISchema(BaseModel):
    api_name: str = ""
    base_url: str = ""
    version: str = ""
    description: str = ""
    auth: AuthScheme = Field(default_factory=lambda: AuthScheme(type="none"))
    endpoints: list[Endpoint] = []


SYSTEM_PROMPT = """You are an expert API documentation parser.
Your job is to extract structured API information from raw documentation text.
You MUST respond with valid JSON only — no markdown, no explanation, no code fences.
The JSON must conform exactly to the schema provided."""

EXTRACTION_PROMPT = """Extract all API endpoints and authentication information from the documentation below.

Return a JSON object with this exact structure:
{{
  "api_name": "Name of the API",
  "base_url": "Base URL if mentioned",
  "version": "API version if mentioned",
  "description": "Brief description of what this API does",
  "auth": {{
    "type": "bearer | api_key | oauth2 | basic | none",
    "header_name": "e.g. Authorization or X-API-Key",
    "description": "How to authenticate"
  }},
  "endpoints": [
    {{
      "path": "/endpoint/path",
      "method": "GET",
      "summary": "Short summary",
      "description": "Detailed description",
      "parameters": [
        {{
          "name": "param_name",
          "location": "query | path | header | body",
          "type": "string | integer | boolean | object | array",
          "required": true,
          "description": "What this param does"
        }}
      ],
      "request_body": {{}},
      "response_schema": {{}},
      "tags": ["tag1"]
    }}
  ]
}}

Documentation:
{content}"""


def _chunk_text(text: str, max_chars: int = 12000) -> list[str]:
    """Split large docs into chunks that fit in the LLM context window."""
    if len(text) <= max_chars:
        return [text]
    
    chunks = []
    while text:
        chunk = text[:max_chars]
        # Try to split at a newline to avoid cutting mid-sentence
        last_newline = chunk.rfind("\n")
        if last_newline > max_chars * 0.8:
            chunk = chunk[:last_newline]
        chunks.append(chunk)
        text = text[len(chunk):]
    return chunks


def _merge_schemas(schemas: list[APISchema]) -> APISchema:
    """Merge multiple chunk results into a single APISchema."""
    if not schemas:
        return APISchema()
    
    merged = schemas[0]
    for schema in schemas[1:]:
        # Merge endpoints, avoiding duplicates by path+method
        existing = {(e.path, e.method) for e in merged.endpoints}
        for endpoint in schema.endpoints:
            if (endpoint.path, endpoint.method) not in existing:
                merged.endpoints.append(endpoint)
                existing.add((endpoint.path, endpoint.method))
    
    return merged

def _parse_openapi_spec(spec: dict, base_url: str) -> APISchema:
    """Parse a raw OpenAPI 3.x or Swagger 2.x spec directly — no LLM needed."""
    info = spec.get("info", {})
    
    # Detect auth
    auth = AuthScheme(type="none")
    security_schemes = spec.get("components", {}).get("securitySchemes", {})
    for scheme_name, scheme in security_schemes.items():
        if scheme.get("type") == "http" and scheme.get("scheme") == "bearer":
            auth = AuthScheme(type="bearer", header_name="Authorization", description=f"Bearer token via {scheme_name}")
        elif scheme.get("type") == "apiKey":
            auth = AuthScheme(type="api_key", header_name=scheme.get("name", "X-API-Key"), description=f"API Key via {scheme_name}")

    endpoints = []
    for path, path_item in spec.get("paths", {}).items():
        for method, operation in path_item.items():
            if method.upper() not in ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]:
                continue
            
            parameters = []
            for p in operation.get("parameters", []):
                schema = p.get("schema", {})
                parameters.append(Parameter(
                    name=p.get("name", ""),
                    location=p.get("in", "query"),
                    type=schema.get("type", "string"),
                    required=p.get("required", False),
                    description=p.get("description", ""),
                ))
            
            endpoints.append(Endpoint(
                path=path,
                method=method.upper(),
                summary=operation.get("summary", ""),
                description=operation.get("description", ""),
                parameters=parameters,
                request_body=operation.get("requestBody", {}),
                response_schema=operation.get("responses", {}),
                tags=operation.get("tags", []),
            ))

    return APISchema(
        api_name=info.get("title", ""),
        base_url=base_url,
        version=info.get("version", ""),
        description=info.get("description", ""),
        auth=auth,
        endpoints=endpoints,
    )

async def parse_documentation(markdown_content: str, base_url: str = "") -> APISchema:
    """
    Parse API documentation. Fast path for OpenAPI specs, LLM fallback for raw HTML docs.
    """
    import re

    # Fast path: detect raw OpenAPI/Swagger JSON — no LLM needed
    json_match = re.search(r'\{[\s\S]*"openapi"[\s\S]*"paths"[\s\S]*\}', markdown_content)
    if json_match:
        logger.info("OpenAPI spec detected — parsing directly without LLM")
        try:
            spec = json.loads(json_match.group())
            return _parse_openapi_spec(spec, base_url)
        except Exception as e:
            logger.warning(f"Direct OpenAPI parse failed, falling back to LLM: {e}")

    # LLM path: for unstructured HTML/Markdown documentation
    logger.info("No OpenAPI spec detected — using LLM parser")
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.0-flash",
        google_api_key=settings.gemini_api_key,
        temperature=0,
    )

    chunks = _chunk_text(markdown_content)
    logger.info(f"Parsing {len(chunks)} chunk(s) of documentation")

    schemas = []
    for i, chunk in enumerate(chunks):
        logger.info(f"Processing chunk {i+1}/{len(chunks)}")
        if i > 0:
            await asyncio.sleep(5)
        try:
            messages = [
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=EXTRACTION_PROMPT.format(content=chunk)),
            ]
            response = await llm.ainvoke(messages)
            raw = response.content.strip()

            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            raw = raw.strip()

            data = json.loads(raw)
            schema = APISchema(**data)
            schemas.append(schema)

        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error on chunk {i+1}: {e}")
        except Exception as e:
            logger.error(f"LLM error on chunk {i+1}: {e}")

    merged = _merge_schemas(schemas)
    if base_url and not merged.base_url:
        merged.base_url = base_url

    logger.info(f"Parsing complete: {len(merged.endpoints)} endpoints extracted")
    return merged