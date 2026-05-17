
---

## Variables de entorno

Copia `.env.example` a `.env` y completa los valores:

```bash
cp .env.example .env
```

| Variable | Descripción |
|---|---|
| `GROQ_API_KEY` | API Key de Groq |
| `DEEPSEEK_API_KEY` | API Key de DeepSeek (fallback) |
| `TAVILY_API_KEY` | API Key de Tavily (búsqueda web) |
| `CHROMA_URL` | URL del servidor ChromaDB |
| `CHROMA_KNOWLEDGE_COLLECTION` | Nombre de la colección de conocimiento médico |
| `CHROMA_UPLOADS_COLLECTION` | Nombre de la colección de uploads de usuarios |
| `PORT` | Puerto del servidor (default: 3001) |
| `ADMIN_USER` | Usuario del panel de administración |
| `ADMIN_PASSWORD` | Contraseña del panel de administración |

---

## Desarrollo local

```bash
# Instalar dependencias
npm install

# Levantar agente + ChromaDB local
docker compose up

# O correr sin Docker
npm run dev
```

---

## Endpoints

| Endpoint | Método | Descripción |
|---|---|---|
| `/chat` | POST | Enviar mensaje al agente |
| `/upload` | POST | Subir documento del usuario |
| `/session/:id` | DELETE | Eliminar sesión y uploads |
| `/admin` | GET | Panel de administración |
| `/admin/sessions` | GET | Ver sesiones activas |
| `/admin/sessions/clear` | POST | Limpiar todas las sesiones |
| `/admin/config` | GET | Ver configuración actual |
| `/admin/config` | POST | Actualizar configuración en caliente |

### Ejemplo `/chat`

```json
POST /chat
{
  "sessionId": "abc123",
  "userName": "Juan",
  "message": "Mi hijo se quemó la mano con agua caliente, qué hago"
}
```

```json
{
  "intent": "emergency",
  "reply": "Tranquilo Juan, vamos a ayudarte paso a paso...",
  "sessionId": "abc123"
}
```

---

## Despliegue en producción

Este contenedor se integra al `docker-compose.yml` del proyecto principal mediante su imagen. Las API Keys **nunca** se suben al repositorio — se gestionan desde el panel de administración en `/admin`, accesible únicamente desde la red interna vía Nginx.

---

## Notas importantes

- La base de conocimiento médica (`knowledge_base`) se carga directamente en ChromaDB en producción — no se incluye en este repositorio
- El historial de conversación vive en memoria — si el contenedor se reinicia, las sesiones activas se pierden
- En una versión futura, el historial puede migrarse a Redis para persistencia entre reinicios
