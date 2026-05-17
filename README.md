# ALEX Agent

Microservicio de agente conversacional de salud para el proyecto ALEX. Construido desde cero en Node.js, diseñado para ser desplegado como contenedor Docker independiente.

## ¿Qué hace este agente?

- Clasifica automáticamente si el mensaje del usuario es una emergencia activa o una consulta informativa
- En emergencias: guía paso a paso, se adapta a las respuestas del usuario y siempre indica llamar al 123
- En consultas: responde de forma completa y recomienda consultar a un profesional
- Consulta una base de conocimiento médica en ChromaDB como fuente principal
- Usa búsqueda web como fuente complementaria cuando ChromaDB no tiene resultados
- Mantiene historial de conversación por sesión con limpieza automática por inactividad
- Fallback automático a DeepSeek si Groq no está disponible

## Stack

| Componente | Tecnología |
|---|---|
| Runtime | Node.js 20 |
| Servidor HTTP | Express |
| Modelo principal | Llama 3.3 70B vía Groq |
| Modelo fallback | DeepSeek V3 / R1 |
| Base vectorial | ChromaDB |
| Búsqueda web | Tavily |

## Estructura del proyecto

- src/agent/index.js — Servidor Express y lógica principal
- src/tools/chromadb.js — Cliente ChromaDB
- src/tools/websearch.js — Búsqueda web con Tavily
- src/memory/conversationHistory.js — Historial por sesión
- src/classifier/intentClassifier.js — Clasificador de intención
- src/config/modelConfig.js — Configuración mutable del modelo
- admin/index.html — Panel de administración web

## Variables de entorno

Copia .env.example a .env y completa los valores.

| Variable | Descripción |
|---|---|
| GROQ_API_KEY | API Key de Groq |
| DEEPSEEK_API_KEY | API Key de DeepSeek (fallback) |
| TAVILY_API_KEY | API Key de Tavily (búsqueda web) |
| CHROMA_URL | URL del servidor ChromaDB |
| CHROMA_KNOWLEDGE_COLLECTION | Nombre de la colección de conocimiento médico |
| CHROMA_UPLOADS_COLLECTION | Nombre de la colección de uploads de usuarios |
| PORT | Puerto del servidor (default: 3001) |
| ADMIN_USER | Usuario del panel de administración |
| ADMIN_PASSWORD | Contraseña del panel de administración |

## Desarrollo local

Instalar dependencias: npm install
Levantar con Docker: docker compose up
Correr sin Docker: npm run dev

## Endpoints

| Endpoint | Método | Descripción |
|---|---|---|
| /chat | POST | Enviar mensaje al agente |
| /upload | POST | Subir documento del usuario |
| /session/:id | DELETE | Eliminar sesión y uploads |
| /admin | GET | Panel de administración |
| /admin/sessions | GET | Ver sesiones activas |
| /admin/sessions/clear | POST | Limpiar todas las sesiones |
| /admin/config | GET | Ver configuración actual |
| /admin/config | POST | Actualizar configuración en caliente |

## Despliegue en producción

Este contenedor se integra al docker-compose.yml del proyecto principal. Las API Keys nunca se suben al repositorio — se gestionan desde el panel de administración en /admin, accesible únicamente desde la red interna vía Nginx.

## Notas importantes

- La base de conocimiento médica se carga directamente en ChromaDB en producción — no se incluye en este repositorio
- El historial de conversación vive en memoria — si el contenedor se reinicia, las sesiones activas se pierden
- En una versión futura, el historial puede migrarse a Redis para persistencia entre reinicios

