import express from 'express';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { classifyIntent } from '../classifier/intentClassifier.js';
import {
  getConversationHistory,
  addToHistory,
  clearHistory,
  getActiveSessions,
  touchSession
} from '../memory/conversationHistory.js';
import {
  queryKnowledgeBase,
  queryUserUploads,
  saveUserUpload,
  clearUserUploads
} from '../tools/chromadb.js';
import { searchWeb } from '../tools/websearch.js';
import { getModelConfig, updateModelConfig } from '../config/modelConfig.js';

dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static('admin'));

// Clientes de modelos
let groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
let deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com'
});

// ─────────────────────────────────────────
// ENDPOINTS PRINCIPALES
// ─────────────────────────────────────────

// Endpoint principal — recibe mensajes del backend
app.post('/chat', async (req, res) => {
  try {
    const { sessionId, userName, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId y message son requeridos' });
    }

    // Registrar actividad de sesión
    touchSession(sessionId);

    // 1. Clasificar intención
    const intent = await classifyIntent(message);

    // 2. Obtener historial de conversación
    const history = getConversationHistory(sessionId);

    // 3. Consultar ChromaDB — knowledge base + uploads del usuario
    const [knowledgeResults, uploadResults] = await Promise.all([
      queryKnowledgeBase(message),
      queryUserUploads(message, sessionId)
    ]);

    const knowledgeContext = [...knowledgeResults, ...uploadResults];

    // 4. Búsqueda web si ChromaDB no retornó resultados
    let webContext = '';
    if (knowledgeContext.length === 0) {
      webContext = await searchWeb(message);
    }

    // 5. Construir system prompt según intención
    const systemPrompt = buildSystemPrompt(intent, userName, knowledgeContext, webContext);

    // 6. Llamar al modelo con fallback automático
    const agentReply = await callModelWithFallback(systemPrompt, history, message);

    // 7. Actualizar historial
    addToHistory(sessionId, { role: 'user', content: message });
    addToHistory(sessionId, { role: 'assistant', content: agentReply });

    return res.json({ intent, reply: agentReply, sessionId });

  } catch (error) {
    console.error('Error en /chat:', error);
    return res.status(500).json({ error: 'Error interno del agente' });
  }
});

// Endpoint para subir documentos del usuario
app.post('/upload', async (req, res) => {
  try {
    const { sessionId, content, fileName } = req.body;

    if (!sessionId || !content || !fileName) {
      return res.status(400).json({ error: 'sessionId, content y fileName son requeridos' });
    }

    touchSession(sessionId);
    const docId = await saveUserUpload(sessionId, content, fileName);

    return res.json({ message: 'Documento guardado correctamente', docId });
  } catch (error) {
    console.error('Error en /upload:', error);
    return res.status(500).json({ error: 'Error al guardar el documento' });
  }
});

// Endpoint para limpiar sesión completa (historial + uploads)
app.delete('/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  clearHistory(sessionId);
  await clearUserUploads(sessionId);
  return res.json({ message: 'Sesión eliminada correctamente' });
});

// ─────────────────────────────────────────
// ENDPOINTS ADMIN
// ─────────────────────────────────────────

// Panel visual
app.get('/admin', (req, res) => {
  res.sendFile(process.cwd() + '/admin/index.html');
});

// Obtener sesiones activas
app.get('/admin/sessions', (req, res) => {
  return res.json({ sessions: getActiveSessions() });
});

// Limpiar todas las sesiones
app.post('/admin/sessions/clear', async (req, res) => {
  const sessions = getActiveSessions();
  for (const sessionId of sessions) {
    clearHistory(sessionId);
    await clearUserUploads(sessionId);
  }
  return res.json({ message: `${sessions.length} sesiones eliminadas` });
});

// Actualizar configuración del modelo en caliente
app.post('/admin/config', (req, res) => {
  const { model, temperature, maxTokens, apiKey, deepseekApiKey, tavilyApiKey } = req.body;

  updateModelConfig({ model, temperature, maxTokens });

  if (apiKey) {
    process.env.GROQ_API_KEY = apiKey;
    groq = new Groq({ apiKey });
  }

  if (deepseekApiKey) {
    process.env.DEEPSEEK_API_KEY = deepseekApiKey;
    deepseek = new OpenAI({ apiKey: deepseekApiKey, baseURL: 'https://api.deepseek.com' });
  }

  if (tavilyApiKey) {
    process.env.TAVILY_API_KEY = tavilyApiKey;
  }

  return res.json({ message: 'Configuración actualizada', config: getModelConfig() });
});

// Obtener configuración actual del modelo
app.get('/admin/config', (req, res) => {
  return res.json(getModelConfig());
});

// ─────────────────────────────────────────
// LÓGICA INTERNA
// ─────────────────────────────────────────

async function callModelWithFallback(systemPrompt, history, message) {
  const config = getModelConfig();

  // Intentar con modelo principal (Groq)
  try {
    const response = await groq.chat.completions.create({
      model: config.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message }
      ]
    });
    return response.choices[0].message.content;
  } catch (primaryError) {
    console.warn('Modelo principal falló, usando fallback DeepSeek:', primaryError.message);
  }

  // Fallback a DeepSeek
  try {
    const response = await deepseek.chat.completions.create({
      model: config.fallback.model,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message }
      ]
    });
    return response.choices[0].message.content;
  } catch (fallbackError) {
    console.error('Fallback también falló:', fallbackError.message);
    throw new Error('No se pudo obtener respuesta de ningún modelo disponible');
  }
}

function buildSystemPrompt(intent, userName, knowledgeContext, webContext) {
  const name = userName || 'usuario';

  const context = knowledgeContext.length > 0
    ? `\n\nINFORMACIÓN DE REFERENCIA:\n${knowledgeContext.join('\n')}`
    : webContext
      ? `\n\nINFORMACIÓN COMPLEMENTARIA DE INTERNET:\n${webContext}`
      : '';

  const base = `Eres ALEX, un asistente de salud conversacional diseñado para ayudar a personas sin conocimientos médicos.
Tu nombre es ALEX. El usuario se llama ${name}.
Siempre hablas en español, con lenguaje simple, claro y sin tecnicismos médicos.
Nunca reemplazas a un médico y siempre que sea necesario lo aclaras.
${context}`;

  if (intent === 'emergency') {
    return `${base}

MODO EMERGENCIA ACTIVO:
- Guía al usuario paso a paso. Una instrucción a la vez.
- Espera confirmación antes de dar el siguiente paso.
- Adapta cada paso según lo que el usuario te reporte.
- Desde tu primer mensaje indica claramente que debe llamar al 123 (emergencias) o al 106 (crisis de salud mental).
- Mantén un tono calmante pero urgente.
- Continúa acompañando al usuario hasta que confirme que llegó personal de emergencias.
- Cuando el usuario confirme que llegó ayuda profesional, despídete indicando que ya está en buenas manos.`;
  }

  return `${base}

MODO CONSULTA:
- Responde de forma completa y clara en un solo mensaje.
- Usa lenguaje simple, sin términos médicos complejos.
- Al final de tu respuesta siempre incluye: "Recuerda que soy un asistente de IA y puedo cometer errores. Para mayor seguridad, consulta a un profesional de salud."`;
}

// ─────────────────────────────────────────
// INICIO DEL SERVIDOR
// ─────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ ALEX Agent corriendo en puerto ${PORT}`);
  console.log(`🔧 Panel admin disponible en /admin`);
});